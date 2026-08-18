# herdr-with-pi 策略層（for pi）

**繁體中文** · [English](README.md)

以 [Herdr](https://herdr.dev) 與 [pi](https://github.com/earendil-works/pi) 為基礎的**多 agent 協作策略層**：何時該分派 subagent、怎麼組合 Herdr tools、以及現成的 subagent profiles。

## 這個 repo 提供什麼

一個**自包含的 pi extension**，用於 [Herdr](https://herdr.dev) 與 [pi](https://github.com/earendil-works/pi) 的多 agent 協作。在 repo 目錄執行 `pi -e .` 即載入全部內容：

- **`herdr_*` tools** — `herdr_layout`、`herdr_pane`、`herdr_agent`，衍生自 [pi-herdr](https://github.com/ogulcancelik/pi-herdr)（MIT © ogulcancelik），並調整了調用策略以配合本 repo 的 skill；另有 `herdr_profile`（列出/讀取/建立 `agents/` 的 subagent profiles）與 `herdr_package`（列出/解析 `$PI_PACKAGES_DIR` 下的 pi packages，供 subagent 工具配置）。
- **`skills/herdr-with-pi/SKILL.md`** — **herdr-with-pi** 策略層。告訴 pi **何時**建議分派 subagent（並行探索、黑箱研究、上下文隔離）、**怎麼**跑標準工作流（開 tab → start → prompt → 監督 → 關閉）、以及**怎麼用**下面的 profiles。這**不是** Herdr 官方 skill（以 CLI 為中心、opt-in）；這是本地重寫版。
- **`agents/`** — 可重用的 subagent profiles（YAML frontmatter + system prompt body）。每個 profile 都是**針對性**的：`tools` 欄位成為 `-t` 白名單，body 為 system prompt。pi packages **不寫死在 profile**——由 main agent 依當前任務透過 `herdr_package` 動態選用（package 目錄常變動），spawn 時解析為 `-e <dir>` 掛載——subagent 只帶任務需要的資源、不多餘。spawn 前 orchestrator 會先透過 `herdr_profile list` 檢查 `agents/`：既有 profile **只有在完全適用時**（領域/語言/職責/工具全部吻合）才直接沿用，否則用 `herdr_profile create` 依需求建立新 profile，之後成為資產供同型別任務使用。

## 架構分工

```
執行層    herdr_* tools（本 repo 內建，衍生自 pi-herdr）
策略層    herdr-with-pi（SKILL.md）：何時用、怎麼用這些 tools、subagent 工作流
資產層    agents/*.md：現成的 subagent profiles
```

## 版面配置慣例

**預設採用 tab 模式**：每個 agent（main + 每個 subagent）都在**同一個 workspace 下各自的 tab**。main agent 留在原本的 tab；每個 subagent 用 `tab_create` 開新 tab（label = agent 名），該 tab 的 root pane 即 subagent 的 pane。畫面永遠只顯示一個 pane（切 tab 監看），小螢幕不會因為 pane 切割而擠爆，也不需要 split / ratio。只有使用者**明確指定**時才改為 **pane 模式（左主右子）**：orchestrator 佔畫面左半 50%，subagent 在右半邊等分——第一次 `pane_split right`，之後只對右側 pane 做 `pane_split down`，並在第 k 次指定 `ratio = 1/(N-k+1)`（絕不動主 agent）。**agent 不自行偵測畫面大小**，由使用者決定模式。完工的 subagent **預設立即關閉**（orchestrator 讀完結果後就 close），除非使用者要求保留。詳細序列與 JSON 範例見 `SKILL.md` → *版面配置慣例*。

## Git worktree 工作流

在 git repo 內、subagent 要實際改檔的並行任務，每個 subagent 在各自的 `git worktree` + branch 工作（pane `cwd` = worktree），可以在自己 branch commit；完工後由獨立 reviewer subagent 審查，通過才由 orchestrator merge 到 `main`，然後關閉 pane 並刪除 worktree & branch。唯讀/研究型任務不需要 worktree。見 `SKILL.md` → *Git repo 並行開發：worktree 工作流*。

## Subagent model fallback

subagent 用的 model 由 env 驅動（`PI_MODEL_DEFAULT` / `PI_MODEL_FALLBACK_HIGH` / `PI_MODEL_FALLBACK_BULK`），在 shell 啟動設定檔（例如 `~/.bashrc`；source 或重開 shell 後生效）export——skill **不硬編碼具體模型**，一律讀取變數，未設定時請使用者設定。`PI_MODEL_DEFAULT` 可用時一律用它；僅當它不可用時才 fallback，依任務類型與併發在 HIGH（品質/長上下文）與 BULK（批量/並行）之間選。只影響 subagent，不影響 orchestrator session。見 `SKILL.md` → *Subagent model 選擇與 fallback*。

## Subagent thinking level

subagent 的 thinking level 在 spawn 時用 `agentArgs` 的 `--thinking <level>` 設定（pi 沒有 `/thinking` 指令，headless 流程中 spawn 後無法再改）。orchestrator 先依上述規則選 model，再依**任務難度 × model 能力**選 level——不同 model 的「有效 level」不同，依能力類別分：支援完整深度階梯的 model（深度 = thinking budget）、實際只有 on/off 的 model（off 快但有誤算風險，on 在 hard 題要數分鐘）、gateway 強制 thinking 的 model（off 關不掉，level 主要影響費率）。每個 profile 依任務型別帶建議的 `thinking` 值，orchestrator 依難度與實際使用的 `PI_MODEL_*` model 調整。見 `SKILL.md` → *Subagent thinking level 選擇*。

## Pi-package 發現目錄（`PI_PACKAGES_DIR`）

pi packages（extensions/skills）**不寫死在 subagent profile**——由 main agent 在每次 spawn 前**依任務動態選用**（package 目錄經常變動，寫死容易過時）。發現目錄來自環境變數 `PI_PACKAGES_DIR`，在 shell 啟動設定檔（例如 `~/.bashrc`；source 或重開 shell 後生效）export：

```bash
# 例如 ~/.bashrc
export PI_PACKAGES_DIR=/path/to/pi-packages
```

已設定時：spawn 前 main agent 會呼叫 `herdr_package list` 查看當下有哪些 packages，依任務挑選需要的，再用 `herdr_package resolve` 解析成 `-e <dir>` 放入 subagent 的 `agentArgs`。`PI_PACKAGES_DIR` 未設定（或為空）時：**完全跳過工具配置**，照常 spawn——profile 的 `tools` 白名單（`-t`）仍適用。

## 載入

```bash
# 在 repo 目錄執行：同時載入 tools + skill
pi -e .
```

`package.json` 的 `pi` manifest 將 `extensions` 指向 `./extensions`（`herdr_*` + `herdr_profile` tools）、`skills` 指向 `./skills`（`herdr-with-pi` skill），因此在 repo 根目錄執行 `pi -e .` 兩者都會載入。extension 也會透過 `resources_discover` 註冊 skill，所以即使只 `pi -e ./extensions/index.ts` 也能讓 skill 被發現。

extension 只在 `HERDR_ENV=1` 且 `HERDR_PANE_ID` 已設定（即 pi 跑在 Herdr 管理的 pane 內）時啟動，否則不載入任何東西，所以全域啟用也安全：

```bash
# 可選：在 settings.json 全域啟用
# "extensions": ["/path/to/this/repo"]
```

若要給官方 pi subagent 工具安裝 profiles，可執行 `./scripts/install.sh`（把 `agents/*.md` symlink 到 `~/.pi/agent/agents/`）。這是選用的——skill 已說明 profile 格式，orchestrator 可直接從本 repo 讀取。

## 開發

```bash
npm install
bun test
```

## 需求

- pi 0.80+
- Herdr 0.7.5+ 執行中，且 pi 跑在 Herdr 管理的 pane 內（`HERDR_ENV=1` 且 `HERDR_PANE_ID` 已設定）

## 目錄結構

```
.
├── extensions/       # pi extension：herdr_* tools（layout/pane/agent）+ herdr_profile + herdr_package + skill 註冊
│   ├── index.ts      #   extension entry（註冊 tools；將 SKILL.md 註冊為 skill）
│   └── index.test.ts #   bun tests（tools 與 profile 用 or 建邏輯）
├── skills/
│   └── herdr-with-pi/
│       └── SKILL.md  # 策略層（何時/怎麼分派）
├── agents/           # subagent profiles（lit-searcher、code-reviewer、…）
├── scripts/
│   └── install.sh    # 選用：symlink profiles 到 ~/.pi/agent/agents/
├── package.json      # pi.extensions -> ./extensions，pi.skills -> ./skills
├── README.md
└── README_zh.md
```

## 授權

本 repo 內容（含 `SKILL.md`）為 MIT，除非另有聲明。[pi-herdr](https://github.com/ogulcancelik/pi-herdr) tools 為 MIT © ogulcancelik。
