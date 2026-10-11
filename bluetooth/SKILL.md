---
name: bluetooth
description: Find, pair, connect and disconnect Bluetooth devices on Linux (speakers, headphones, earbuds, game controllers like a PS5 DualSense, keyboards), and send the computer's sound to a Bluetooth speaker. Use it whenever the user asks which devices are nearby or detected (even without saying "Bluetooth"), to connect or disconnect a speaker or controller, or to "play music on the speaker". Always through its bt.sh: a plain `bluetoothctl scan on` stops scanning the moment it returns and finds nothing new.
---

# Bluetooth

Everything goes through `bt.sh`, in the same folder as this SKILL.md: take the path you read this
file from and change `SKILL.md` to `bt.sh` (installed with /skills it is
`~/.kinoko/skills/bluetooth/bt.sh`). It wraps `bluetoothctl` and PipeWire's `pactl` so each step is
one command that ends on its own. Do not use `bluetoothctl` yourself: run alone, `scan on` stops the
scan as soon as it returns (only paired devices show up), and with no arguments it waits for input
forever.

```
bash ~/.kinoko/skills/bluetooth/bt.sh list               # known devices, connected or not, battery
bash ~/.kinoko/skills/bluetooth/bt.sh scan [seconds]     # devices nearby (default 12 s), then list
bash ~/.kinoko/skills/bluetooth/bt.sh connect "lg cm"    # pair if needed, trust, connect
bash ~/.kinoko/skills/bluetooth/bt.sh audio "lg cm"      # sound to that speaker/headset
bash ~/.kinoko/skills/bluetooth/bt.sh disconnect "dualsense"
bash ~/.kinoko/skills/bluetooth/bt.sh forget "dualsense" # unpair
```

"Which devices are nearby / do you see": `scan`, then report its list.

A name matches any part of the device's name, ignoring case; when several match, it lists them
and you use the address instead.

## Connecting

1. `bt.sh list` first: a device paired before connects at once, no scan needed.
2. Not there: the device must be in **pairing mode**, then `bt.sh connect NAME` scans by itself.
   Tell the user how, before they wait:
   - PS5 controller (DualSense): hold **Create** and **PS** together until the light bar flashes.
   - A speaker or headphones: their Bluetooth button (often a long press) until it blinks or says so.
3. `connect` makes a speaker or headset the audio output on its own. To move sound later:
   `bt.sh audio NAME`.

"Play music on the speaker": connect it (or `audio` if it is connected), then start the music the
usual way (the music tool when there is one). What is already playing moves to it too.

## When it fails

- "could not pair": the device left pairing mode (they time out after a minute or two): ask the
  user to put it in pairing mode again, then retry.
- "paired but did not connect": it is off, out of range, or connected to another phone or computer:
  ask the user to disconnect it there.
- A controller cannot be woken from the computer: the user switches it on (PS button) and a
  DualSense paired here connects by itself in a few seconds; check with `list`. If it was paired
  with a PS5 since, it forgot this computer: pairing mode (Create + PS), then `connect`.
- "connected but its audio did not start": bt.sh already connected it a second time; ask the user to
  switch the speaker off and on, then `connect` again.
- Pairing a device that was paired before and misbehaves: `forget` it, pairing mode, `connect`.
- No Bluetooth at all: `bluetoothctl show` says whether the adapter is there and powered;
  `rfkill list bluetooth` whether it is blocked.

Report what the script printed: the device's name and what changed (connected, audio moved).
