---
name: bluetooth
description: Find, pair, connect and disconnect Bluetooth devices on Linux (speakers, headphones, earbuds, game controllers like a PS5 DualSense, keyboards), and send the computer's sound to a Bluetooth speaker. Use when the user asks to connect or disconnect something over Bluetooth, to search for devices, to "play music on the speaker", or which devices are connected.
---

# Bluetooth

Everything goes through `bt.sh`, in this skill's folder (beside this SKILL.md). It wraps
`bluetoothctl` and PipeWire's `pactl` so each step is one command that ends on its own: never run
`bluetoothctl` interactively (it waits for input forever).

```
bash <this folder>/bt.sh list                 # known devices, connected or not, battery
bash <this folder>/bt.sh scan [seconds]       # look for devices nearby (default 12 s), then list
bash <this folder>/bt.sh connect "lg cm"      # pair if needed, trust, connect
bash <this folder>/bt.sh audio "lg cm"        # sound to that speaker/headset
bash <this folder>/bt.sh disconnect "dualsense"
bash <this folder>/bt.sh forget "dualsense"   # unpair
```

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
- Pairing a device that was paired before and misbehaves: `forget` it, pairing mode, `connect`.
- No Bluetooth at all: `bluetoothctl show` says whether the adapter is there and powered;
  `rfkill list bluetooth` whether it is blocked.

Report what the script printed: the device's name and what changed (connected, audio moved).
