# herdr-with-pi strategy layer for pi

[繁體中文 (zh-TW)](README_zh.md) · **English**

The **strategy layer** for multi-agent orchestration with [Herdr](https://herdr.dev) and [pi](https://github.com/earendil-works/pi): when to delegate to subagents, how to combine the Herdr tools, and ready-made subagent profiles.

## What this repo provides

A **self-contained pi extension** for multi-agent orchestration with [Herdr](https://herdr.dev) and [pi](https://github.com/earendil-works/pi). `pi -e .` from this directory loads everything:

- **`herdr_*` tools** — `herdr_layout`, `herdr_pane`, `herdr_agent`, derived from [pi-herdr](https://github.com/ogulcancelik/pi-herdr) (MIT © ogulcancelik), adapted so the invocation policy follows this repo's skill; plus `herdr_profile` (list/read/create subagent profiles in `agents/`), `herdr_package` (list/resolve pi packages under `$PI_PACKAGES_DIR` for subagent tool provisioning) and `herdr_thinking` (compute the subagent's `--thinking` level + spawn agentArgs from task difficulty and model capability, with a persistent capability table at `agents/thinking-classes.json` that `record` extends after a probe). The live capability table is **gitignored (local-only)** — it records environment-measured behavior; its location is driven by the fixed env var `$PI_THINKING_CLASSES` (fallback: `<repo>/agents/thinking-classes.json`), `herdr_thinking action=list` shows which models are already known, and `agents/thinking-classes.example.json` documents the format for fresh clones.
- **`skills/herdr-with-pi/SKILL.md`** — the **herdr-with-pi** strategy layer. It tells pi *when* to suggest delegating to subagents (parallel exploration, black-box research, context isolation), *how* to run the standard workflow (tab → start → prompt → supervise → close), and *how* to use the profiles below. This is **not** the upstream Herdr skill (CLI-focused, opt-in); it is a local rewrite.
- **`agents/`** — reusable subagent profiles (YAML frontmatter + system-prompt body). Each profile is targeted: its `tools` field becomes the `-t` allow-list and its body is the system prompt. Pi packages are **not** pinned in profiles — the main agent picks them dynamically per task via `herdr_package` (the package folder changes often), resolving them to `-e <dir>` flags at spawn so subagents carry no extra context. Before spawning, the orchestrator checks `agents/` via `herdr_profile list`: an existing profile is reused only when it is *exactly* fit (domain/language/responsibility/tools all match); otherwise a new profile is created with `herdr_profile create` and becomes an asset for later tasks.

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

Subagent models are driven by env vars (`PI_MODEL_DEFAULT`, `PI_MODEL_FALLBACK_HIGH`, `PI_MODEL_FALLBACK_BULK`) exported from your shell startup file (e.g. `~/.bashrc`; source it or open a new shell) — the skill never hardcodes concrete model ids; it always reads the vars and asks the user when they are unset. `PI_MODEL_DEFAULT` is used whenever available; only when it is unavailable does the skill fall back, choosing between HIGH (quality / long context) and BULK (parallel / bulk) based on task type and concurrency. This only affects subagents, never the orchestrator session. See `SKILL.md` → *Subagent model 選擇與 fallback*.

## Subagent thinking level

Subagent thinking level is set at spawn via `--thinking <level>` in `agentArgs` (pi has no `/thinking` command, so it cannot be changed later in a headless flow). The orchestrator calls the **`herdr_thinking` tool** right after picking the model (per the fallback rules above): it takes the model and the task difficulty and returns the recommended level plus the `--model`/`--thinking` agentArgs, classifying the model by provider/gateway rules → recorded capability table (`agents/thinking-classes.json`, gitignored/local-only — environment-measured, never commit) → model-design families (`deepseek-v4-*` on/off only, `qwen3.5/3.6/3.8` budget ladder). Unrecognized models get conservative defaults plus a probe instruction; after one probe the orchestrator persists the verified class with `action=record` so later spawns skip re-testing. Profiles carry a suggested `thinking` value per task type as a fallback. See `SKILL.md` → *Subagent thinking level 選擇*.

## Pi-package discovery (`PI_PACKAGES_DIR`)

Pi packages (extensions/skills) are **not** pinned in subagent profiles — the main agent picks them **dynamically per task** before each spawn (the package folder changes often, so pinned names go stale). The discovery directory comes from the `PI_PACKAGES_DIR` env var, exported from your shell startup file (e.g. `~/.bashrc`; source it or open a new shell to take effect):

```bash
# e.g. ~/.bashrc
export PI_PACKAGES_DIR=/path/to/pi-packages
```

When set, before each spawn the main agent calls `herdr_package list` to see what is currently available, picks the packages the task needs, resolves them with `herdr_package resolve`, and passes them as `-e <dir>` in the subagent's `agentArgs`. When `PI_PACKAGES_DIR` is unset (or empty), tool provisioning is skipped entirely and spawning works as before — the profile `tools` allow-list (`-t`) still applies.

## Load

```bash
# From this directory: loads tools + skill together
pi -e .
```

The `package.json` `pi` manifest points `extensions` at `./extensions` (the `herdr_*` + `herdr_profile` tools) and `skills` at `./skills` (the `herdr-with-pi` skill), so `pi -e .` from the repo root loads both. The extension also registers the skill via `resources_discover` so a bare `pi -e ./extensions/index.ts` keeps the skill discoverable.

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
- Herdr 0.7.5+ running, with pi inside a Herdr-managed pane (`HERDR_ENV=1` and `HERDR_PANE_ID` set)

## Structure

```
.
├── extensions/       # pi extension: herdr_* tools (layout/pane/agent) + herdr_profile + herdr_package + skill registration
│   ├── index.ts      #   extension entry (registers tools; discovers SKILL.md as skill)
│   └── index.test.ts #   bun tests for the tools and profile use-or-create logic
├── skills/
│   └── herdr-with-pi/
│       └── SKILL.md  # strategy layer (when/how to delegate)
├── agents/           # subagent profiles (lit-searcher, code-reviewer, …)
├── scripts/
│   └── install.sh    # optional: symlink profiles into ~/.pi/agent/agents/
├── package.json      # pi.extensions -> ./extensions, pi.skills -> ./skills
├── README.md
└── README_zh.md
```

## License

`SKILL.md` and everything else in this repo: MIT, unless stated otherwise. The [pi-herdr](https://github.com/ogulcancelik/pi-herdr) tools are MIT © ogulcancelik.
