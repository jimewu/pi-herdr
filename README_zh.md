# herdr-with-pi 策略層（for pi）

以 [Herdr](https://herdr.dev) 與 [pi](https://github.com/earendil-works/pi) 為基礎的**多 agent 協作策略層**：何時該分派 subagent、怎麼組合 Herdr tools、以及現成的 subagent profiles。

## 這個 repo 提供什麼

一個**自包含的 pi extension**，用於 [Herdr](https://herdr.dev) 與 [pi](https://github.com/earendil-works/pi) 的多 agent 協作。在 repo 目錄執行 `pi -e .` 即載入全部內容：

- **`herdr_*` tools** — `herdr_layout`、`herdr_pane`、`herdr_agent`，衍生自 [pi-herdr](https://github.com/ogulcancelik/pi-herdr)（MIT © ogulcancelik），並調整了調用策略以配合本 repo 的 skill。
- **`SKILL.md`** — **herdr-with-pi** 策略層。告訴 pi **何時**建議分派 subagent（並行探索、黑箱研究、上下文隔離）、**怎麼**跑標準工作流（split → start → prompt → 監督 → 關閉）、以及**怎麼用**下面的 profiles。這**不是** Herdr 官方 skill（以 CLI 為中心、opt-in）；這是本地重寫版。
- **`agents/`** — 可重用的 subagent profiles（YAML frontmatter + system prompt body）。orchestrator 讀取 profile 後組裝 `herdr_agent start` 參數（`--model`、`-t`、`--append-system-prompt`）。

## 架構分工

```
執行層    herdr_* tools（本 repo 內建，衍生自 pi-herdr）
策略層    herdr-with-pi（SKILL.md）：何時用、怎麼用這些 tools、subagent 工作流
資產層    agents/*.md：現成的 subagent profiles
```

## 版面配置慣例

**左主右子**：orchestrator（主 agent）**永遠佔畫面左半邊（50%）**，subagent 在右半邊**等分**排列（第一個最上方、依序向下）。第一次 `pane_split right`，之後只對最新產生的右側 pane 做 `pane_split down`，並在第 k 次指定 `ratio = 1/(N-k+1)` 讓右半邊均分（絕不動主 agent）。完工的 subagent **預設立即關閉**（orchestrator 讀完結果後就 close），除非使用者要求保留。詳細 split 序列與 JSON 範例見 `SKILL.md` → *版面配置慣例*。

## 載入

```bash
# 在 repo 目錄執行：同時載入 tools + skill
pi -e .
```

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
- Herdr 0.7.5+ 執行中，且 pi 跑在 Herdr 管理的 pane 內（`HERDR_ENV=1`）

## 目錄結構

```
.
├── index.ts              # extension entry：註冊 herdr_* tools + SKILL.md 為 skill
├── index.test.ts         # bun tests
├── package.json          # pi.extensions -> ./index.ts
├── SKILL.md              # 策略層（何時/怎麼分派）
├── agents/               # subagent profiles（lit-searcher、code-reviewer、…）
├── scripts/
│   └── install.sh        # 選用：symlink profiles 到 ~/.pi/agent/agents/
├── README.md
└── README_zh.md
```

## 授權

本 repo 內容（含 `SKILL.md`）為 MIT，除非另有聲明。[pi-herdr](https://github.com/ogulcancelik/pi-herdr) tools 為 MIT © ogulcancelik。
