# herdr skill for pi

The [Herdr](https://herdr.dev) agent skill, vendored for use with
[pi](https://github.com/badlogic/pi) — a coding agent that implements the
[Agent Skills standard](https://agentskills.io/specification).

This repo contains `SKILL.md`, a verbatim copy of
[`skills/herdr/SKILL.md`](https://github.com/herdrdev/herdr/blob/master/skills/herdr/SKILL.md)
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

Note: herdr 0.7.5 has **no** `herdr --skill` command (it returns
`unknown option`, exit 2), even though the Herdr docs (0.8.0) mention it; that
built-in copy only exists in newer binaries. To compare against a specific
installed version, download the upstream `SKILL.md` at the matching version tag
instead — see [Verify](#verify).

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
curl -fsSL https://raw.githubusercontent.com/herdrdev/herdr/master/skills/herdr/SKILL.md \
  | diff - SKILL.md && echo "SKILL.md matches upstream master"
```

Or diff against a pinned tag (e.g. the version of the skill you intend to run):

```bash
curl -fsSL https://raw.githubusercontent.com/herdrdev/herdr/v0.8.0/skills/herdr/SKILL.md \
  | diff - SKILL.md && echo "SKILL.md matches upstream v0.8.0"
```

The diff compares the whole file, so it does not depend on the frontmatter
length. Note that the upstream default branch is `master`, not `main`; URLs
pointing at `main` return 404.

## Update

The vendored `SKILL.md` is a snapshot; keep it in sync with upstream. The
upstream default branch is `master`, not `main`, so always pass a ref:

```bash
./scripts/update-skill.sh master      # upstream default branch
./scripts/update-skill.sh v0.8.0      # or pin a tag
```

Running the script without a ref uses its built-in default (`main`), which is
not an upstream branch and fails cleanly — `SKILL.md` is only replaced after
the download passes a frontmatter check, so a bad ref never clobbers it.

You can also reinstall with the official tool:
`npx skills add herdrdev/herdr --skill herdr -g`. Note that this installs an
**independent copy** — it puts `SKILL.md` into `~/.agents/skills/herdr` and
symlinks `~/.pi/agent/skills/herdr` to it. That is a separate track from this
repo's `update-skill.sh`: the two copies do **not** auto-sync, so pick one
workflow and don't mix them.

## License / attribution

`SKILL.md` is © herdrdev, Apache-2.0. Everything else in this repo is MIT
unless stated otherwise. The canonical file lives in the upstream repository:
<https://github.com/herdrdev/herdr/blob/master/skills/herdr/SKILL.md>
