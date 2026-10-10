// Every folder is a skill kinoko can install: a SKILL.md whose frontmatter names it after its
// folder and says, on one line once joined, when to use it.

import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";

const folders = readdirSync(import.meta.dir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
  .map((e) => e.name);

/** name and description from the frontmatter; indented lines continue the value above them. */
function frontmatter(text: string): Record<string, string> {
  const lines = text.split("\n");
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (lines[0]?.trim() !== "---" || end < 0) return {};
  const out: Record<string, string> = {};
  let key = "";
  for (const line of lines.slice(1, end)) {
    const m = /^(\w+):\s*(.*)$/.exec(line);
    if (m) {
      key = m[1] ?? "";
      out[key] = /^[>|][+-]?$/.test(m[2] ?? "") ? "" : (m[2] ?? "");
    } else if (key && /^\s/.test(line)) out[key] = `${out[key]} ${line.trim()}`.trim();
  }
  return out;
}

test("there is at least one skill", () => {
  expect(folders.length).toBeGreaterThan(0);
});

for (const name of folders) {
  test(`${name}: SKILL.md named after its folder, with a description`, async () => {
    const meta = frontmatter(await Bun.file(`${import.meta.dir}/${name}/SKILL.md`).text());
    expect(meta.name).toBe(name);
    expect((meta.description ?? "").length).toBeGreaterThan(20);
  });
}
