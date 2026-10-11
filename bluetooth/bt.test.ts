// bt.sh against a fake bluetoothctl and pactl (on PATH first): devices kept in a folder, so the
// real Bluetooth is never touched.

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "kinoko-bt-"));
const bin = join(root, "bin");
const state = join(root, "state");
afterAll(() => rmSync(root, { recursive: true, force: true }));

// One file per device: "name|paired|connected|icon". `nearby/` holds what a scan finds.
const fakeBluetoothctl = `#!/usr/bin/env bash
S=${state}
args=()
while [[ $# -gt 0 ]]; do case $1 in --agent|--timeout) shift 2 ;; *) args+=("$1"); shift ;; esac; done
set -- "\${args[@]}"
field() { cut -d'|' -f"$2" "$S/known/$1"; }
set_field() { IFS='|' read -r n p c i < "$S/known/$1"; case $2 in 2) p=$3 ;; 3) c=$3 ;; esac; echo "$n|$p|$c|$i" > "$S/known/$1"; }
case $1 in
  power|trust) ;;
  scan) cp -n "$S"/nearby/* "$S/known/" 2>/dev/null ;;
  devices) for f in "$S"/known/*; do [[ -e $f ]] && echo "Device $(basename "$f") $(field "$(basename "$f")" 1)"; done ;;
  info) [[ -e $S/known/$2 ]] || exit 1
        echo "Device $2"; echo "	Name: $(field "$2" 1)"; echo "	Icon: $(field "$2" 4)"
        echo "	Paired: $(field "$2" 2)"; echo "	Connected: $(field "$2" 3)" ;;
  pair) [[ -e $S/pairable/$2 ]] && set_field "$2" 2 yes ;;
  connect) [[ $(field "$2" 2) == yes ]] && set_field "$2" 3 yes ;;
  disconnect) set_field "$2" 3 no ;;
  remove) rm -f "$S/known/$2" ;;
esac
`;
const fakePactl = `#!/usr/bin/env bash
S=${state}
case "$1 $2" in
  "list short") if [[ $3 == sinks ]]; then for f in "$S"/known/*; do
      IFS='|' read -r n p c i < "$f"; a=$(basename "$f")
      [[ $c == yes && $i == audio-* ]] && printf '7\\tbluez_output.%s.1\\tPipeWire\\n' "\${a//:/_}"
    done; fi ;;
  "set-default-sink "*) echo "$2" > "$S/default-sink" ;;
esac
`;

function device(where: "known" | "nearby", addr: string, name: string, paired = "no", connected = "no", icon = ""): void {
  writeFileSync(join(state, where, addr), `${name}|${paired}|${connected}|${icon}\n`);
}

async function bt(...args: string[]): Promise<{ out: string; err: string; code: number }> {
  const proc = Bun.spawn(["bash", join(import.meta.dir, "bt.sh"), ...args], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { out: out.trim(), err: err.trim(), code };
}

beforeEach(() => {
  rmSync(state, { recursive: true, force: true });
  for (const d of ["known", "nearby", "pairable"]) mkdirSync(join(state, d), { recursive: true });
  mkdirSync(bin, { recursive: true });
  for (const [name, body] of [["bluetoothctl", fakeBluetoothctl], ["pactl", fakePactl], ["rfkill", "#!/bin/sh\n"]] as const) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
});

describe("bluetooth skill: bt.sh", () => {
  test("list: connected first, then paired, then the rest; nameless ones only counted", async () => {
    device("known", "AA:00:00:00:00:01", "Kitchen Radio", "no", "no", "audio-card");
    device("known", "AA:00:00:00:00:02", "DualSense Wireless Controller", "yes", "no", "input-gaming");
    device("known", "AA:00:00:00:00:03", "LG CM2460(04)", "yes", "yes", "audio-card");
    device("known", "AA:00:00:00:00:04", "AA-00-00-00-00-04");
    const { out } = await bt("list");
    expect(out.split("\n")).toEqual([
      "LG CM2460(04)  AA:00:00:00:00:03  connected, paired, audio-card",
      "DualSense Wireless Controller  AA:00:00:00:00:02  not connected, paired, input-gaming",
      "Kitchen Radio  AA:00:00:00:00:01  not connected, not paired, audio-card",
      "(and 1 nearby that do not say their name)",
    ]);
  });

  test("connect a speaker never seen: it scans, pairs, connects and the sound goes to it", async () => {
    device("nearby", "BB:00:00:00:00:01", "LG CM2460(04)", "no", "no", "audio-card");
    writeFileSync(join(state, "pairable", "BB:00:00:00:00:01"), "");
    const { out, code } = await bt("connect", "lg cm");
    expect(code).toBe(0);
    expect(out).toContain("connected to LG CM2460(04) (BB:00:00:00:00:01)");
    expect(out).toContain("audio now plays on LG CM2460(04)");
    expect(readFileSync(join(state, "default-sink"), "utf8").trim()).toBe("bluez_output.BB_00_00_00_00_01.1");
  });

  test("a controller paired before connects without a scan, and the sound stays where it was", async () => {
    device("known", "CC:00:00:00:00:01", "DualSense Wireless Controller", "yes", "no", "input-gaming");
    const { out } = await bt("connect", "dualsense");
    expect(out).toBe("connected to DualSense Wireless Controller (CC:00:00:00:00:01)");
    expect(await Bun.file(join(state, "default-sink")).exists()).toBe(false);
  });

  test("not in pairing mode: says how to put it there; two of the same name: asks for the address", async () => {
    device("nearby", "DD:00:00:00:00:01", "DualSense Wireless Controller"); // seen, but not pairable
    const notPairing = await bt("connect", "dualsense");
    expect(notPairing.code).toBe(1);
    expect(notPairing.err).toContain("could not pair DualSense Wireless Controller");
    device("known", "DD:00:00:00:00:02", "DualSense Wireless Controller", "yes");
    const two = await bt("disconnect", "dualsense");
    expect(two.err).toBe("ERROR: several devices match \"dualsense\": DualSense Wireless Controller (DD:00:00:00:00:01); DualSense Wireless Controller (DD:00:00:00:00:02). Use the address.");
    expect((await bt("disconnect", "DD:00:00:00:00:02")).out).toBe("disconnected DualSense Wireless Controller");
    const none = await bt("connect", "toaster");
    expect(none.err).toContain("no device \"toaster\" found nearby. Put it in pairing mode");
  });

  test("a paired controller that is off: says to press its PS button, not to wait", async () => {
    device("known", "CC:00:00:00:00:02", "DualSense Wireless Controller", "yes", "no", "input-gaming");
    writeFileSync(join(bin, "bluetoothctl"), fakeBluetoothctl.replace("connect) [[", "connect) false && [["));
    const { err, code } = await bt("connect", "dualsense");
    expect(code).toBe(1);
    expect(err).toContain("cannot switch a controller on. Press its PS button");
  }, 15_000); // connect waits 5 s for the link before giving up

  test("forget unpairs; audio on a controller says it has none", async () => {
    device("known", "EE:00:00:00:00:01", "DualSense Wireless Controller", "yes", "yes", "input-gaming");
    expect((await bt("audio", "dualsense")).err).toContain("has no audio output");
    expect((await bt("forget", "dualsense")).out).toBe("forgot DualSense Wireless Controller: it must be paired again to connect");
    expect((await bt("list")).out).toStartWith("no devices known yet");
  });
});
