# pi-herdr strategy layer for pi

The **strategy layer** for multi-agent orchestration with [Herdr](https://herdr.dev) and [pi](https://github.com/earendil-works/pi): when to delegate to subagents, how to combine the Herdr tools, and ready-made subagent profiles.

## What this repo provides

- **`SKILL.md`** — the strategy layer. It tells pi *when* to suggest delegating to subagents (parallel exploration, black-box research, context isolation), *how* to run the standard workflow (split → start → prompt → supervise → close), and *how* to use the profiles below. This is **not** the upstream Herdr skill (which is CLI-focused and opt-in); it is a local rewrite tuned for the [pi-herdr](https://github.com/ogulcancelik/pi-herdr) extension tools.
- **`agents/`** — reusable subagent profiles (YAML frontmatter + system-prompt body) in the [pi subagent format](https://github.com/earendil-works/pi/blob/main/examples/extensions/subagent/README.md). Orchestrator reads a profile and assembles `herdr_agent start` args (`--model`, `-t`, `--append-system-prompt`) from it.
- **`scripts/install.sh`** — symlinks the skill and profiles into pi's discovery locations.

## How it fits together

```
execution layer     pi-herdr extension (3rd party): herdr_layout / herdr_pane / herdr_agent tools
strategy layer      this repo's SKILL.md: when & how to use those tools, subagent workflow
asset layer         this repo's agents/*.md: ready-made subagent profiles
```

The tools come from [pi-herdr](https://github.com/ogulcancelik/pi-herdr) (MIT, by ogulcancelik) — structured tools that call the `herdr` CLI. This repo only adds the strategy and the profiles; it does not reimplement the tools.

## Install

```bash
# 1. Symlink the skill so pi discovers it (name: herdr)
ln -sfn "$PWD" ~/.agents/skills/herdr

# 2. Install the pi-herdr extension (execution layer) into pi
#    Either from the monorepo checkout:
ln -sfn /path/to/pi-herdr/packages/pi-herdr ~/.pi/agent/extensions/pi-herdr
#    Or via npm:
#    pi install npm:@ogulcancelik/pi-herdr

# 3. (Optional) Symlink subagent profiles for the official pi subagent tool
mkdir -p ~/.pi/agent/agents
ln -sf "$PWD"/agents/*.md ~/.pi/agent/agents/
```

Or run `./scripts/install.sh` which does steps 1 and 3.

## Requirements

- pi 0.80+
- Herdr 0.7.5+ running, with pi inside a Herdr-managed pane (`HERDR_ENV=1`)
- The pi-herdr extension installed (for the `herdr_*` tools)

## Structure

```
.
├── SKILL.md              # strategy layer (when/how to delegate)
├── agents/               # subagent profiles (lit-searcher, code-reviewer, …)
│   ├── lit-searcher.md
│   └── code-reviewer.md
├── scripts/
│   └── install.sh        # symlink skill + profiles into pi locations
├── README.md
└── README_zh.md
```

## License

`SKILL.md` and everything else in this repo: MIT, unless stated otherwise. The [pi-herdr](https://github.com/ogulcancelik/pi-herdr) tools are MIT © ogulcancelik.
