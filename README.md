# herdr-with-pi strategy layer for pi

The **strategy layer** for multi-agent orchestration with [Herdr](https://herdr.dev) and [pi](https://github.com/earendil-works/pi): when to delegate to subagents, how to combine the Herdr tools, and ready-made subagent profiles.

## What this repo provides

A **self-contained pi extension** for multi-agent orchestration with [Herdr](https://herdr.dev) and [pi](https://github.com/earendil-works/pi). `pi -e .` from this directory loads everything:

- **`herdr_*` tools** — `herdr_layout`, `herdr_pane`, `herdr_agent`, derived from [pi-herdr](https://github.com/ogulcancelik/pi-herdr) (MIT © ogulcancelik), adapted so the invocation policy follows this repo's skill.
- **`SKILL.md`** — the **herdr-with-pi** strategy layer. It tells pi *when* to suggest delegating to subagents (parallel exploration, black-box research, context isolation), *how* to run the standard workflow (tab → start → prompt → supervise → close), and *how* to use the profiles below. This is **not** the upstream Herdr skill (CLI-focused, opt-in); it is a local rewrite.
- **`agents/`** — reusable subagent profiles (YAML frontmatter + system-prompt body). Orchestrator reads a profile and assembles `herdr_agent start` args (`--model`, `-t`, `--append-system-prompt`) from it.

## How it fits together

```
execution layer     herdr_* tools (in this repo, derived from pi-herdr)
strategy layer      herdr-with-pi (SKILL.md): when & how to use those tools, subagent workflow
asset layer         agents/*.md: ready-made subagent profiles
```

## Layout convention

**Tab mode by default**: every agent (main + each subagent) lives in its own tab under the same workspace. The orchestrator stays in its original tab; each subagent gets a new tab via `tab_create` (label = agent name) whose root pane is the subagent's pane. The screen always shows a single pane — you monitor by switching tabs, so small screens are never squeezed by panes and no split/ratio is needed. Only when the user **explicitly asks** does the layout switch to **pane mode** (left-master, right-workers): the orchestrator keeps the left half (50%) and subagents divide the right half into equal rows via one `pane_split right` followed by `pane_split down` with `ratio = 1/(N-k+1)` on the k-th split. Agents never auto-detect screen size — the user decides the mode. Finished subagents are **closed by default** right after the orchestrator reads their results, unless the user asks to keep them. See `SKILL.md` → *版面配置慣例* for the exact sequences and JSON examples.

## Git worktree workflow

In a git repo where parallel subagents actually edit files, each subagent works in its own `git worktree` + branch (pane `cwd` = the worktree), may commit on its own branch, and is reviewed by an independent reviewer subagent before the orchestrator merges to `main`. After delivery the orchestrator closes the pane and removes the worktree & branch. Read-only / research tasks skip worktrees. See `SKILL.md` → *Git repo 並行開發：worktree 工作流*.

## Subagent model fallback

Subagent models are driven by env vars (`PI_MODEL_DEFAULT`, `PI_MODEL_FALLBACK_HIGH`, `PI_MODEL_FALLBACK_BULK`) exported from `~/.profile` — the skill never hardcodes concrete model ids; it always reads the vars and asks the user when they are unset. `PI_MODEL_DEFAULT` is used whenever available; only when it is unavailable does the skill fall back, choosing between HIGH (quality / long context) and BULK (parallel / bulk) based on task type and concurrency. This only affects subagents, never the orchestrator session. See `SKILL.md` → *Subagent model 選擇與 fallback*.

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
