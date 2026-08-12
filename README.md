# herdr skill for pi

The [Herdr](https://herdr.dev) agent skill, vendored for use with
[pi](https://github.com/badlogic/pi) — a coding agent that implements the
[Agent Skills standard](https://agentskills.io/specification).

This repo contains `SKILL.md`, a verbatim copy of
[`skills/herdr/SKILL.md`](https://github.com/herdrdev/herdr/blob/main/skills/herdr/SKILL.md)
from the [`herdrdev/herdr`](https://github.com/herdrdev/herdr) repository
(Apache-2.0). It teaches an agent how to control Herdr from inside a
Herdr-managed pane via the `herdr` CLI.

## What it does

When loaded, the skill lets the agent:

- inspect workspaces, tabs, panes, and neighboring agents
- split panes and run commands without stealing focus
- read pane output and recent logs
- wait for servers, tests, or another agent to finish
- start a helper agent in an adjacent pane (including `--kind pi`)

## Requirements

- You run your agent **inside Herdr** so that `HERDR_ENV=1` is set (the skill
  refuses to run otherwise).
- The `herdr` CLI is in `PATH`.
- Optionally, run `herdr --skill` once: it prints the built-in copy of this
  skill that matches your installed Herdr binary version.

## Install for pi

Clone this repo and symlink it into a global skill location:

```bash
git clone <this-repo> ~/src/skill-herdr   # or wherever you keep it
ln -s ~/src/skill-herdr ~/.agents/skills/herdr
```

pi discovers skills from `~/.agents/skills/` and `~/.pi/agent/skills/`
(global) and `.pi/skills/` / `.agents/skills/` (per project). Alternatives:

```bash
# project-scoped
mkdir -p .pi/skills && ln -s ~/src/skill-herdr .pi/skills/herdr

# or point pi at it explicitly
pi --skill ~/src/skill-herdr
```

The skill name is `herdr`; it loads on demand when you mention Herdr in a
prompt. You can also force it with `/skill:herdr` (needs `enableSkillCommands`
in settings).

## Verify

```bash
test "${HERDR_ENV:-}" = 1 && echo "inside herdr"
herdr --skill | diff - <(sed -n '5,$p' SKILL.md) && echo "skill matches installed herdr"
```

## Update

The vendored `SKILL.md` is a snapshot; keep it in sync with upstream:

```bash
./scripts/update-skill.sh            # fetch main
./scripts/update-skill.sh v0.8.0     # pin a tag
```

Or reinstall with the official tool: `npx skills add herdrdev/herdr --skill herdr -g`.

## License / attribution

`SKILL.md` is © herdrdev, Apache-2.0. Everything else in this repo is MIT
unless stated otherwise. See `herdr --skill` or the upstream repository for the
canonical file.
