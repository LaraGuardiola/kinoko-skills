# kinoko-skills 🍄

Skills for [kinoko](https://github.com/LaraGuardiola/kinoko), one folder each, installed one by one.

| Skill | When kinoko uses it |
|---|---|
| `bluetooth` | Finding, pairing and connecting Bluetooth devices (speakers, headphones, a PS5 controller), and sending the sound to a speaker. |
| `write-kinoko-extension` | Writing, testing or fixing an extension for kinoko-extensions. |

## Install

In kinoko, open the menu with `/` and pick **skills**: it lists this repo's skills (fetched with git
into `~/.kinoko/registry/skills/`). Enter installs or updates one into `~/.kinoko/skills/<name>/`;
Del twice removes it. kinoko lists skills to the model (name and description only; the body is
read when the task matches); one installed or removed while it runs is told to the model with your
next message.

By hand: copy a folder to `~/.kinoko/skills/<name>/`.

## Write one

A folder named like the skill, with a `SKILL.md`:

```markdown
---
name: my-skill
description: What it does and when to use it, with the words a user would say. One paragraph.
---

# The body: steps, commands, pitfalls. Read only when the task matches.
```

Other files (scripts, templates) may sit beside it; the body refers to them by relative path.
`bun run check` validates every folder.
