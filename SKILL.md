---
name: herdr
description: "以 Herdr 為基礎的多 agent 協作策略層。當任務可拆成多個獨立子任務、需要並行探索（try & error）、只要結論不需過程、或想隔離高 token 消耗工作時，建議使用 Herdr 分派 subagent（透過 pi-herdr extension 的 herdr_layout / herdr_pane / herdr_agent tools）。需要 HERDR_ENV=1。"
---

# Herdr 多 agent 協作（策略層）

本 skill 是 [pi-herdr](https://github.com/ogulcancelik/pi-herdr) extension（`herdr_layout` / `herdr_pane` / `herdr_agent` tools）的**策略層**：tools 提供執行能力，本 skill 說明**何時用、怎麼組合、以及 subagent 的分派方式**。兩者搭配使用。

## 執行前檢查

- `HERDR_ENV=1`：確認自己跑在 Herdr 管理的 pane 內。若否，停止。
- `herdr_agent list`：確認現有 agent 狀態，避免名稱衝突、重複啟動。

## 何時**建議**分派 subagent（主動提出，不等使用者開口）

任務符合以下特徵時，主動建議「是否要用 Herdr 分派 subagent」，等使用者同意後再動手：

1. **多個獨立子任務**：任務可自然拆成不同檔案/不同策略/不同輸入，彼此無依賴
2. **並行探索（try & error）**：需要反覆嘗試才能找到答案（如檢索關鍵字組合、參數調校），失敗成本需要隔離
3. **黑箱研究**：只要結論、不需過程；過程可能需讀長文或反覆（文獻研讀、code review、可行性評估）
4. **上下文隔離**：單一任務預期消耗大量 token（讀大檔案、長輸出），丟給 subagent 可保護 orchestrator 的 context

## 何時**不**建議分派

- **小任務**：改一行、讀小檔案——分派與驗證的成本比任務本身貴
- **依賴鏈**：後續任務需要前面的中間結果（pipeline 只能順序做）
- **需一致觀點**：一份文件的各章節要風格統一，難以乾淨切分
- **精細決策**：重要判斷需 orchestrator 親自把關

## 標準工作流

```
準備 → 分派 → 監督 → 收尾
```

### 1. 準備

```json
{ "action": "list" }                              // herdr_agent：現況
{ "action": "pane_layout", "pane": "<caller>" }   // herdr_layout：決定 split 方向
```

### 2. 分派

```json
// herdr_layout：開 sibling pane（預設同 tab、同 cwd、不搶焦點）
{ "action": "pane_split", "cwd": "<caller cwd>", "focus": false }

// herdr_agent：啟動 subagent。agentArgs 可量身訂做（見下節）
{
  "action": "start",
  "name": "<唯一小寫名>",
  "kind": "pi",
  "pane": "<新 pane id>",
  "agentArgs": ["--append-system-prompt", "你的身份是…", "-t", "read,bash"]
}

// herdr_agent：派任務，等結果
{ "action": "prompt", "target": "<name>", "prompt": "…", "wait": true, "timeout": 300000 }
```

**分派並行任務**：一次同時送出多個 prompt（各自不同任務），並行 wait。

### 3. 監督

- `herdr_agent wait <target>`：等 lifecycle 穩定（idle/done/blocked）
- `herdr_agent read <target>`：讀輸出。**wait 立即返回 idle 不代表完成**——以 read 的實際內容為準
- read 收不到完整輸出（alternate screen）時：叫 subagent 把完整結果寫成 Markdown 檔回報路徑，再直接讀檔案
- `herdr_pane wait_output`：等一般命令的輸出（測試、server、build）

### 4. 收尾

- orchestrator 親自驗證產出（讀 diff、跑測試），**統一 commit**（subagent 全程不碰 git）
- `herdr_pane close <pane id>`：關閉**完成任務**的 subagent。不要關閉自己所在的 pane（tool 會拒絕）；不要關閉不是自己創建的 pane，除非使用者明確要求

## Subagent profiles（agents/ 目錄）

本 repo 的 `agents/*.md` 是已建置好的 subagent 設定（資產），避免每次重新構思。格式為 YAML frontmatter + body：

```markdown
---
name: lit-searcher
description: 文獻檢索助理（PubMed 等），擅長關鍵字策略反覆嘗試
tools: read, bash
model: model
---
（system prompt 內容）
```

**用法**：orchestrator 讀取 profile → 用 frontmatter 的 `model` / `tools` / body 組裝 `herdr_agent start` 的 `agentArgs`（`--model`、`-t`、`--append-system-prompt`）→ 任務完成後把經驗寫回 profile（改版迭代）。

## 量身訂做參數（agentArgs，實測有效）

| 參數 | 用途 |
|---|---|
| `--append-system-prompt <text>` | 附加身份/規則（不取代預設） |
| `--system-prompt <text>` | 完全取代預設 system prompt |
| `-t <tools>` | 工具白名單（如 `-t read`） |
| `--skill <path>` | 強制載入指定 skill |
| `--model <pattern>` | 指定模型 |

原則：subagent 只需要任務相關的工具與身份，**不要背多餘上下文**。

## 並行與安全規則

- **劃分檔案範圍**：同 repo 並行改檔時，明確指定「你只能動哪個檔案」，避免互踩
- **git 單執行緒**：subagent 一律禁止 git 操作（add/commit/status），由 orchestrator 統一 commit
- **資源**：並行數量受 pane 空間與機器負載限制；避免同方向連續 split 造成太窄
- **不依賴另一個 client 的焦點 pane**：一律用 `--current`、明確 pane id、或唯一 agent 名稱
- **ID 不猜測**：從 tools 回傳的 JSON 讀取 opaque ID（workspace/tab/pane），不要自行推斷

## 時機判斷速查

| 情境 | 動作 |
|---|---|
| 多個獨立任務 | 並行分派 |
| try & error（關鍵字/參數） | 分派多路線探索，各給不同策略 |
| 長文研讀只要結論 | 分派黑箱研究，要求結論 + output contract |
| 大 token 消耗工作 | 分派隔離，保護 orchestrator context |
| 小任務 / 依賴鏈 / 需一致風格 | 自己做 |
