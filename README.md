# pi-herdr strategy layer for pi

The **strategy layer** for multi-agent orchestration with [Herdr](https://herdr.dev) and [pi](https://github.com/earendil-works/pi): when to delegate to subagents, how to combine the Herdr tools, and ready-made subagent profiles.

## What this repo provides

A **self-contained pi extension** for multi-agent orchestration with [Herdr](https://herdr.dev) and [pi](https://github.com/earendil-works/pi). `pi -e .` from this directory loads everything:

- **`herdr_*` tools** — `herdr_layout`, `herdr_pane`, `herdr_agent`, derived from [pi-herdr](https://github.com/ogulcancelik/pi-herdr) (MIT © ogulcancelik), adapted so the invocation policy follows this repo's skill.
- **`SKILL.md`** — the strategy layer. It tells pi *when* to suggest delegating to subagents (parallel exploration, black-box research, context isolation), *how* to run the standard workflow (split → start → prompt → supervise → close), and *how* to use the profiles below. This is **not** the upstream Herdr skill (CLI-focused, opt-in); it is a local rewrite.
- **`agents/`** — reusable subagent profiles (YAML frontmatter + system-prompt body). Orchestrator reads a profile and assembles `herdr_agent start` args (`--model`, `-t`, `--append-system-prompt`) from it.

## How it fits together

```
execution layer     herdr_* tools (in this repo, derived from pi-herdr)
strategy layer      SKILL.md: when & how to use those tools, subagent workflow
asset layer         agents/*.md: ready-made subagent profiles
```

## Load

```bash
# From this directory: loads tools + skill together
pi -e .
```

The extension activates only when `HERDR_ENV=1` and `HERDR_PANE_ID` are set (i.e. pi running inside a Herdr-managed pane). Otherwise it loads nothing, so it is safe to enable globally:

```bash
# Optional: enable globally via settings.json
# "extensions": ["/path/to/this/repo"]
```

To install the subagent profiles for the official pi subagent tool, run `./scripts/install.sh` (symlinks `agents/*.md` into `~/.pi/agent/agents/`). This is optional — the skill documents the profile format and the orchestrator can read them directly from this repo.

## Development

```bash
npm install
bun test
```

## Requirements

- pi 0.80+
- Herdr 0.7.5+ running, with pi inside a Herdr-managed pane (`HERDR_ENV=1`)

## Structure

```
.
├── index.ts              # extension entry: registers herdr_* tools + SKILL.md as skill
├── index.test.ts         # bun tests for the tools
├── package.json          # pi.extensions -> ./index.ts
├── SKILL.md              # strategy layer (when/how to delegate)
├── agents/               # subagent profiles (lit-searcher, code-reviewer, …)
├── scripts/
│   └── install.sh        # optional: symlink profiles into ~/.pi/agent/agents/
├── README.md
└── README_zh.md
```

## License

`SKILL.md` and everything else in this repo: MIT, unless stated otherwise. The [pi-herdr](https://github.com/ogulcancelik/pi-herdr) tools are MIT © ogulcancelik.
