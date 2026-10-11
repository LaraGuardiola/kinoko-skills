#!/usr/bin/env bash
# bt.sh: Bluetooth for an agent, one command at a time, never interactive.
#
#   bt.sh list                 known devices: name, address, paired, connected, kind
#   bt.sh scan [seconds]       look for devices nearby (default 12 s), then list
#   bt.sh connect NAME|ADDR    pair (if needed), trust and connect; a speaker or headset
#                              also becomes the audio output
#   bt.sh audio NAME|ADDR      make a connected speaker/headset the audio output
#   bt.sh disconnect NAME|ADDR
#   bt.sh forget NAME|ADDR     unpair (remove) it
#
# NAME matches any part of the device's name, ignoring case ("lg cm", "dualsense").

set -u
TIMEOUT=${BT_TIMEOUT:-25}

die() { echo "ERROR: $*" >&2; exit 1; }
bt() { timeout "$TIMEOUT" bluetoothctl "$@" 2>/dev/null; }

power_on() {
  rfkill unblock bluetooth 2>/dev/null
  bt power on >/dev/null
}

# "ADDR NAME" lines of every device bluetoothctl knows (paired or seen in a scan).
devices() { bt devices | sed -n 's/^Device \([0-9A-Fa-f:]\{17\}\) \(.*\)$/\1 \2/p'; }

# A device's property ("Paired", "Connected", "Icon"...) from bluetoothctl info.
prop() { bt info "$1" | sed -n "s/^[[:space:]]*$2: \(.*\)$/\1/p" | head -1; }

# A name or an address → one address; says what matched when it is not exactly one.
resolve() {
  local q=$1
  if [[ $q =~ ^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$ ]]; then echo "${q^^}"; return; fi
  local all hits exact
  all=$(devices)
  hits=$(printf '%s\n' "$all" | awk -v q="${q,,}" 'tolower(substr($0, 19)) ~ q' | grep -v '^$')
  exact=$(printf '%s\n' "$all" | awk -v q="${q,,}" 'tolower(substr($0, 19)) == q' | grep -v '^$')
  [[ -n $exact && $(printf '%s\n' "$exact" | wc -l) -eq 1 ]] && { echo "${exact%% *}"; return; }
  case $(printf '%s' "$hits" | grep -c '') in
    0) return 1 ;;
    1) echo "${hits%% *}" ;;
    *) echo "ERROR: several devices match \"$q\": $(printf '%s\n' "$hits" | sed 's/^\(.\{17\}\) \(.*\)$/\2 (\1)/' | paste -sd ';' | sed 's/;/; /g'). Use the address." >&2; return 2 ;;
  esac
}

# resolve, or stop: not found says so, several found already said which.
need() {
  local addr rc
  addr=$(resolve "$1"); rc=$?
  [[ $rc == 2 ]] && exit 1
  [[ $rc == 0 ]] || die "no device \"$1\" (bt.sh list, or bt.sh scan with it in pairing mode)"
  echo "$addr"
}

cmd_list() {
  local found=0 unnamed=0 rows=()
  while read -r addr name; do
    [[ -z $addr ]] && continue
    found=1
    local info paired connected icon battery
    info=$(bt info "$addr")
    paired=$(sed -n 's/^[[:space:]]*Paired: \(.*\)$/\1/p' <<<"$info" | head -1)
    connected=$(sed -n 's/^[[:space:]]*Connected: \(.*\)$/\1/p' <<<"$info" | head -1)
    icon=$(sed -n 's/^[[:space:]]*Icon: \(.*\)$/\1/p' <<<"$info" | head -1)
    battery=$(sed -n 's/^[[:space:]]*Battery Percentage: .*(\([0-9]*\))$/\1/p' <<<"$info" | head -1)
    # Nearby devices that do not say their name (the address stands in for it) are only counted.
    if [[ $paired != yes && $name == "${addr//:/-}" ]]; then unnamed=$((unnamed + 1)); continue; fi
    local rank=2
    [[ $paired == yes ]] && rank=1
    [[ $connected == yes ]] && rank=0
    rows+=("$rank$(printf '%s  %s  %s%s%s%s' "$name" "$addr" \
      "$([[ $connected == yes ]] && echo "connected" || echo "not connected")" \
      "$([[ $paired == yes ]] && echo ", paired" || echo ", not paired")" \
      "${icon:+, $icon}" "${battery:+, battery $battery%}")")
  done < <(devices)
  [[ $found == 1 ]] || { echo "no devices known yet: put the device in pairing mode, then: bt.sh scan"; return; }
  # Connected first, then paired, then the rest nearby.
  printf '%s\n' "${rows[@]}" | sort -s -k1,1 | cut -c2-
  [[ $unnamed == 0 ]] || echo "(and $unnamed nearby that do not say their name)"
}

cmd_scan() {
  local secs=${1:-12}
  power_on
  # A scan only runs while bluetoothctl does: the timeout is the scan's length.
  timeout $((secs + 5)) bluetoothctl --timeout "$secs" scan on >/dev/null 2>&1
  cmd_list
}

# The audio output (PipeWire/PulseAudio sink) of a connected device, by its address.
sink_of() { pactl list short sinks 2>/dev/null | awk -v a="${1//:/_}" 'index($2, a) { print $2; exit }'; }

cmd_audio() {
  local addr sink
  addr=$(need "$1") || exit 1
  # A controller or a keyboard has no sound to send: said at once, not after waiting for it.
  case $(prop "$addr" Icon) in
    audio-* | "") ;;
    *) die "$(prop "$addr" Name) has no audio output (it is a $(prop "$addr" Icon), not a speaker or headset)" ;;
  esac
  # The sink appears a moment after the connection.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sink=$(sink_of "$addr")
    [[ -n $sink ]] && break
    sleep 1
  done
  [[ -n $sink ]] || die "$(prop "$addr" Name) has no audio output (not connected, or not a speaker/headset)"
  pactl set-default-sink "$sink" || die "could not make it the audio output"
  # What is already playing moves there too.
  pactl list short sink-inputs 2>/dev/null | awk '{print $1}' | while read -r input; do pactl move-sink-input "$input" "$sink" 2>/dev/null; done
  echo "audio now plays on $(prop "$addr" Name)"
}

cmd_connect() {
  local q=$1 addr name
  power_on
  addr=$(resolve "$q"); local rc=$?
  [[ $rc == 2 ]] && exit 1
  if [[ $rc != 0 ]]; then
    echo "\"$q\" not known yet: scanning 12 s (the device must be in pairing mode)…"
    timeout 17 bluetoothctl --timeout 12 scan on >/dev/null 2>&1
    addr=$(need "$q" 2>/dev/null) || die "no device \"$q\" found nearby. Put it in pairing mode (a PS5 controller: hold Create + PS until the light flashes; a speaker: its Bluetooth button) and try again."
  fi
  name=$(prop "$addr" Name)
  if [[ $(prop "$addr" Paired) != yes ]]; then
    bt --agent NoInputNoOutput pair "$addr" >/dev/null
    [[ $(prop "$addr" Paired) == yes ]] || die "could not pair $name: is it still in pairing mode?"
  fi
  bt trust "$addr" >/dev/null
  if [[ $(prop "$addr" Connected) != yes ]]; then
    bt connect "$addr" >/dev/null
    for _ in 1 2 3 4 5; do [[ $(prop "$addr" Connected) == yes ]] && break; sleep 1; done
  fi
  if [[ $(prop "$addr" Connected) != yes ]]; then
    # A controller is never woken from here: switched on, it connects by itself.
    [[ $(prop "$addr" Icon) == input-gaming ]] && die "$name is paired but did not connect: the computer cannot switch a controller on. Press its PS button: it connects by itself in a few seconds (check with bt.sh list). Still nothing: it was paired with a console since, so hold Create + PS until the light flashes and connect again."
    die "$name is paired but did not connect: is it on and in range?"
  fi
  echo "connected to $name ($addr)"
  case $(prop "$addr" Icon) in
    audio-*) cmd_audio "$addr" ;;
  esac
}

cmd_disconnect() {
  local addr
  addr=$(need "$1") || exit 1
  bt disconnect "$addr" >/dev/null
  echo "disconnected $(prop "$addr" Name)"
}

cmd_forget() {
  local addr name
  addr=$(need "$1") || exit 1
  name=$(prop "$addr" Name)
  bt remove "$addr" >/dev/null
  echo "forgot $name: it must be paired again to connect"
}

command -v bluetoothctl >/dev/null || die "bluetoothctl is not installed (package bluez-utils)"
case ${1:-list} in
  list) cmd_list ;;
  scan) cmd_scan "${2:-12}" ;;
  connect) [[ -n ${2:-} ]] || die "connect what? bt.sh connect NAME|ADDR"; cmd_connect "$2" ;;
  audio) [[ -n ${2:-} ]] || die "audio to what? bt.sh audio NAME|ADDR"; cmd_audio "$2" ;;
  disconnect) [[ -n ${2:-} ]] || die "bt.sh disconnect NAME|ADDR"; cmd_disconnect "$2" ;;
  forget) [[ -n ${2:-} ]] || die "bt.sh forget NAME|ADDR"; cmd_forget "$2" ;;
  *) die "unknown: ${1}. Commands: list, scan, connect, audio, disconnect, forget" ;;
esac
