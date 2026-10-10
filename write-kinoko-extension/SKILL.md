---
name: write-kinoko-extension
description: Write, test or change an extension for kinoko (the coding-agent harness) in the kinoko-extensions repository. Use when the user asks for a new kinoko extension, a tool or slash command for kinoko, a hook on kinoko's events (tool_call, tool_result, run_end...), or to fix one of the extensions (check-early, herdr, permission-gate, plan-mode, web).
---

# Write a kinoko extension

Extensions live in **kinoko-extensions** (`git@github.com:LaraGuardiola/kinoko-extensions.git`;
locally often `~/Projects/kinoko-extensions`). One folder each; kinoko installs one at a time from
its `/extensions` page into `~/.kinoko/ext/<name>/`. Read the repository's `AGENTS.md` first.

## The folder

```
my-ext/
  index.ts        default export: (k: Kinoko) => void | Promise<void>
  index.test.ts   bun:test, with testing/bus.ts standing in for kinoko
  package.json    {"name": "kinoko-ext-my-ext", "description": "...", "private": true, "type": "module"}
```

- The folder is copied **alone**: from outside it, import only `import type { ... } from "../api.ts"`
  (types vanish at runtime). Everything else it needs is inside the folder.
- Runtime libraries go in its own `package.json` `dependencies`; kinoko runs `bun install` in the
  installed folder. Keep them few: no dependency is the default.
- `description` is what kinoko's list shows: one line, what it does, not how.

## The handle

```ts
import type { Kinoko } from "../api.ts";

export default function (k: Kinoko): void {
  k.on("tool_call", (call) => {
    // mutate call.args, or return { block: true, reason } (the reason is what the model sees)
  });
  k.on("tool_result", (result) => {
    // result.output may be rewritten in place
  });
  k.registerTool({ name: "my_tool", description: "...", schema: { type: "object", properties: {} }, run: async (args, ctx) => "..." });
  k.registerCommand("my-cmd", (args) => `did ${args}`);
}
```

Events: `session_start` (`cwd`, `model`, `mode`: tui, print or rpc), `context` (return the messages
to send), `before_provider_request`, `tool_call`, `tool_result`, `turn_end`, `compact`, `run_end`.

Rules kinoko holds every extension to:

- A handler never throws into kinoko (a throw is logged and skipped, but do not rely on it).
- Every async operation honors an AbortSignal (`ctx.signal` in a tool) and has a timeout; nothing
  blocks the event loop (no spawnSync, no long synchronous loops): the user can always press Esc.
- A tool error is returned as text starting with `ERROR:`, not thrown.

## Test and ship

```ts
import { Bus } from "../testing/bus.ts";
import install from "./index.ts";

const bus = new Bus();
install(bus);
bus.emit("session_start", { cwd: "/p", model: "m", mode: "tui" });
bus.beforeTool({ name: "bash", args: { command: "ls" }, signal: new AbortController().signal });
```

1. `bun run check` in the repository (oxlint with zero warnings, tsc, tests).
2. Add the extension to the README's table.
3. Commit and push; in kinoko, `/` then **extensions**, Enter on it, restart kinoko.

When kinoko's extension API changes (`src/ext.ts`, `src/types.ts` in kinoko), change `api.ts` the
same way.
