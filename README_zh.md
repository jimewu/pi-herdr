# pi-herdr 策略層（for pi）

以 [Herdr](https://herdr.dev) 與 [pi](https://github.com/earendil-works/pi) 為基礎的**多 agent 協作策略層**：何時該分派 subagent、怎麼組合 Herdr tools、以及現成的 subagent profiles。

## 這個 repo 提供什麼

- **`SKILL.md`** — 策略層。告訴 pi **何時**建議分派 subagent（並行探索、黑箱研究、上下文隔離）、**怎麼**跑標準工作流（split → start → prompt → 監督 → 關閉）、以及**怎麼用**下面的 profiles。這**不是** Herdr 官方 skill（官方版以 CLI 為中心且為 opt-in）；這是針對 [pi-herdr](https://github.com/ogulcancelik/pi-herdr) extension tools 重寫的本地版本。
- **`agents/`** — 可重用的 subagent profiles（YAML frontmatter + system prompt body），採用 [pi subagent 格式](https://github.com/earendil-works/pi/blob/main/examples/extensions/subagent/README.md)。orchestrator 讀取 profile 後組裝 `herdr_agent start` 參數（`--model`、`-t`、`--append-system-prompt`）。
- **`scripts/install.sh`** — 把 skill 與 profiles symlink 到 pi 的發現位置。

## 架構分工

```
執行層    pi-herdr extension（第三方）：herdr_layout / herdr_pane / herdr_agent tools
策略層    本 repo 的 SKILL.md：何時用、怎麼用這些 tools、subagent 工作流
資產層    本 repo 的 agents/*.md：現成的 subagent profiles
```

tools 來自 [pi-herdr](https://github.com/ogulcancelik/pi-herdr)（MIT，ogulcancelik）——透過結構化 tools 呼叫 `herdr` CLI。本 repo 只提供策略與 profiles，**不重寫 tools**。

## 安裝

```bash
# 1. Symlink skill，讓 pi 發現（name: herdr）
ln -sfn "$PWD" ~/.agents/skills/herdr

# 2. 安裝 pi-herdr extension（執行層）到 pi
#    從 monorepo checkout 直接 symlink：
ln -sfn /path/to/pi-herdr/packages/pi-herdr ~/.pi/agent/extensions/pi-herdr
#    或用 npm：
#    pi install npm:@ogulcancelik/pi-herdr

# 3.（可選）symlink subagent profiles，給官方 pi subagent 工具用
mkdir -p ~/.pi/agent/agents
ln -sf "$PWD"/agents/*.md ~/.pi/agent/agents/
```

或直接執行 `./scripts/install.sh`（涵蓋步驟 1 與 3）。

## 需求

- pi 0.80+
- Herdr 0.7.5+ 執行中，且 pi 跑在 Herdr 管理的 pane 內（`HERDR_ENV=1`）
- 已安裝 pi-herdr extension（提供 `herdr_*` tools）

## 目錄結構

```
.
├── SKILL.md              # 策略層（何時/怎麼分派）
├── agents/               # subagent profiles（lit-searcher、code-reviewer、…）
│   ├── lit-searcher.md
│   └── code-reviewer.md
├── scripts/
│   └── install.sh        # symlink skill + profiles 到 pi 位置
├── README.md
└── README_zh.md
```

## 授權

本 repo 內容（含 `SKILL.md`）為 MIT，除非另有聲明。[pi-herdr](https://github.com/ogulcancelik/pi-herdr) tools 為 MIT © ogulcancelik。
