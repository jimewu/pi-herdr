---
name: herdr-with-pi
description: "以 Herdr 為基礎的多 agent 協作策略層（herdr-with-pi）。當任務可拆成多個獨立子任務、需要並行探索（try & error）、只要結論不需過程、或想隔離高 token 消耗工作時，建議使用 Herdr 分派 subagent（透過 pi-herdr extension 的 herdr_layout / herdr_pane / herdr_agent tools）。需要 HERDR_ENV=1。"
---

# Herdr 多 agent 協作（策略層）

本 skill（herdr-with-pi）是 [pi-herdr](https://github.com/ogulcancelik/pi-herdr) extension（`herdr_layout` / `herdr_pane` / `herdr_agent` tools）的**策略層**：tools 提供執行能力，本 skill 說明**何時用、怎麼組合、以及 subagent 的分派方式**。兩者搭配使用。

## 執行前檢查

- `HERDR_ENV=1`：確認自己跑在 Herdr 管理的 pane 內。若否，停止。
- `herdr_agent list`：確認現有 agent 狀態，避免名稱衝突、重複啟動。
- git repo 內要派 subagent 改檔前：確認 main checkout 乾淨（`git status`），並先想好 worktree 目錄

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

## 版面配置慣例（layout）

預設採用**左主右子**：orchestrator（主 agent）**永遠佔整個畫面左半邊（50%）**，subagent 在右半邊**等分**排列（第一個最上方，依序向下）。

```
┌─────────┬──────────────┐
│         │  subagent 1   │  ← 右上
│ 主 agent│───────────────│
│ （左半） │  subagent 2   │  ← 右中
│         │───────────────│
│         │  subagent 3   │  ← 右下
└─────────┴──────────────┘
```

開法（以主 agent 的 pane 為起點）：

1. 第一次 split：`pane_split right`（在主 agent 右側產生第一個 subagent pane；主 agent 保持左半 50%）
2. 之後**只對最新產生的右側 pane** 做 `pane_split down`，維持左主右子——**絕對不要再對主 agent 的 pane 做任何 split**
3. 共有 N 個 subagent 時，第 k 次 down split（k = 1..N-1）要指定 `ratio = 1/(N-k+1)`（ratio 是 source pane 保留的比例，即上方 pane 佔剩餘區塊的比例），右半邊才會**等分**：
   - N=2：`down(1/2)` → 右半上下各 1/2
   - N=3：`down(1/3)`、`down(1/2)` → 右半上中下各 1/3
   - N=4：`down(1/4)`、`down(1/3)`、`down(1/2)` → 右半四等分

```json
// 例：3 個並行 subagent（pane = 主 agent 的 pane id）
{ "action": "pane_split", "direction": "right", "focus": false }                                  // → sub1（右上）
{ "action": "pane_split", "pane": "<sub1>", "direction": "down", "ratio": 0.333, "focus": false }  // → sub2（右中，ratio = 1/3）
{ "action": "pane_split", "pane": "<sub2>", "direction": "down", "ratio": 0.5, "focus": false }   // → sub3（右下，ratio = 1/2）
```

注意：
- 不要對主 agent 的 pane 做任何 split——左半 50% 永遠屬於主 agent；subagent 增加只影響右半邊
- 對右半 pane 連續 down split 時**務必帶 ratio**，否則新 pane 會越切越小（實測 N=3 不帶 ratio 會得到 20/10/9 的不均等，不是三等分）

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

// herdr_agent：啟動 subagent。agentArgs 只放單行安全參數（見「量身訂做參數」的 ⚠️ 警告）
{
  "action": "start",
  "name": "<唯一小寫名>",
  "kind": "pi",
  "pane": "<新 pane id>",
  // model 依 PI_MODEL_* env 選用（見「Subagent model 選擇與 fallback」），啟動前先讀實際值
  "agentArgs": ["-t", "read,bash", "--model", "<依任務型別選出的 provider/model>"]
}

// herdr_agent：派任務，等結果。身份/規則/output contract 一律放這裡，不要塞 agentArgs
{ "action": "prompt", "target": "<name>", "prompt": "…", "wait": true, "timeout": 300000 }
```

**分派並行任務**：一次同時送出多個 prompt（各自不同任務），並行 wait。

### 3. 監督

- `herdr_agent wait <target>`：等 lifecycle 穩定（idle/done/blocked）
- `herdr_agent read <target>`：讀輸出。**wait 立即返回 idle 不代表完成**——以 read 的實際內容為準
- read 收不到完整輸出（alternate screen）時：叫 subagent 把完整結果寫成 Markdown 檔回報路徑，再直接讀檔案
- `herdr_pane wait_output`：等一般命令的輸出（測試、server、build）

### 4. 收尾

- orchestrator 親自驗證產出（讀 diff、跑測試）。git repo 內改 code 的任務走 **worktree 工作流**（見下節）：review 通過才 merge，然後**關 pane + 刪 worktree & branch**；不走 worktree 的小任務由 orchestrator **統一 commit**（subagent 不碰 git）
- **完工即關閉（預設）**：subagent 任務完成、orchestrator 讀取並驗證結果後，**立即 `herdr_pane close <pane id>` 關閉**，回收 pane 空間——**不要**保留已完成任務的 subagent，除非使用者明確要求保留（例如後續還要追問）
- 不要關閉自己所在的 pane（tool 會拒絕）；不要關閉不是自己創建的 pane，除非使用者明確要求

## Git repo 並行開發：worktree 工作流

在 **git repo 內、且 subagent 要實際改檔** 的並行任務，用 `git worktree` 讓每個 subagent 在**獨立的 worktree + branch** 工作，避免互踩、也保護 orchestrator 的 main checkout。唯讀研究型任務（如 lit-searcher 查文獻）不需要 worktree。

```
準備 → 分派 → 監督 → review → 交付與清理
```

### 準備：開 worktree

orchestrator 在 main checkout 為每個 subagent 開一個 worktree + branch：

```bash
git worktree add <repo>/.herdr-wt/<agent-name> -b <agent-name> main
```

- worktree 建議放 repo 目錄下的 `.herdr-wt/`（記得加進 `.gitignore`）；branch 名用 subagent 名，方便對應與清理
- 只為「會改檔」的任務開 worktree；一個任務一個 worktree，不要共用

### 分派：pane 開在 worktree 內

```json
{ "action": "pane_split", "cwd": "<repo>/.herdr-wt/<agent-name>", "focus": false }
```

subagent 的 cwd 就是它的 worktree，pane 與 branch 一一對應。

### 監督期間的 git 規則（worktree 模式）

- **允許 subagent 在自己的 branch commit**（checkpoint），這正是 worktree 隔離的目的
- **禁止**：碰 main 或其他 branch、`git push`、`git worktree` 管理指令、刪除/移動 repo 內其他檔案
- 交付時要求 subagent **commit 全部改動、留下乾淨的 worktree**（無 untracked），否則清理會失敗

### review：獨立 reviewer 把關

subagent 完成後，用 `agents/code-reviewer.md` profile 開一個**唯讀 reviewer subagent**（開在該 worktree 內，或由 orchestrator 把 `git diff main...<branch>` 餵給它）審查：

- 正確性、與 main 的一致性、安全性、可維護性（見 code-reviewer profile）
- **只讀不改**：reviewer 不 commit、不改檔

review 結論：

- **通過** → orchestrator 交付（merge）
- **不通過** → 把 findings 丟回原 subagent 修改（迭代），或直接捨棄該 branch

### 交付與清理

review 通過後，orchestrator 在 main checkout 依序執行：

```bash
git merge --no-ff <agent-name>          # ① merge 進 main
herdr_pane close <pane id>              # ② 關閉 subagent 的 pane
# ③ 刪 worktree（--force 清掉殘留 untracked）
git worktree remove --force <repo>/.herdr-wt/<agent-name>
git branch -D <agent-name>              # ④ 刪 branch
```

- **順序很重要**：先關 pane 再刪 worktree（subagent 可能還開著檔案/程序）
- 合併有衝突時 orchestrator 手動解決；「劃分檔案範圍」仍要做，讓衝突最少化
- 每個 subagent 完工都清乾淨，**不留孤兒 worktree / branch**

## Subagent model 選擇與 fallback

subagent 啟動時用的 model 由 env 決定（**只影響 subagent，不影響 orchestrator 自己的 model**）：

| env 變數（~/.profile） | 用途 | 本機預設值 |
|---|---|---|
| `PI_MODEL_DEFAULT` | 一般 subagent 預設 | `provider/model`（1M ctx） |
| `PI_MODEL_FALLBACK_HIGH` | 品質優先 / 需長上下文（單一併發） | `provider/model`（1M ctx） |
| `PI_MODEL_FALLBACK_BULK` | 大量並行、品質要求普通（8 併發） | `provider/model`（192K ctx） |

**選用規則**（先依任務型別選，再談失敗 fallback）：

| 任務型別 | 用 |
|---|---|
| 單一品質關鍵任務 / 需要 >192K context | `PI_MODEL_FALLBACK_HIGH`（1M ctx；**單一併發，多個並行會排隊**） |
| 同時多個並行 subagent（批量） | `PI_MODEL_FALLBACK_BULK`（8 併發） |
| 一般任務 | `PI_MODEL_DEFAULT` |

**失敗 fallback chain**：`start` 失敗或 subagent 因 provider 錯誤而 blocked 時，關掉該 pane、依序用下一個 model 重新 start：`DEFAULT → HIGH → BULK`。

注意：
- 啟動前先 `echo $PI_MODEL_DEFAULT $PI_MODEL_FALLBACK_HIGH $PI_MODEL_FALLBACK_BULK` 讀取實際值；未設定時用上表預設值
- `~/.profile` 被 `~/.zshrc` source，**只對新開的 pane 生效**——已開的 pane 要 `source ~/.profile` 或重開
- bulk model（model）**輸出上限 8K tokens**：長文件/長報告任務不要派給它
- `--model` 一律用完整 `provider/model` 格式（見「量身訂做參數」的 ⚠️ 警告）

## Subagent profiles（agents/ 目錄）

本 repo 的 `agents/*.md` 是已建置好的 subagent 設定（資產），避免每次重新構思。格式為 YAML frontmatter + body：

```markdown
---
name: lit-searcher
version: 0.1.0
description: 文獻檢索助理（PubMed 等），擅長關鍵字策略反覆嘗試
tools: read, bash
model: model
changelog: |
  - 0.1.0: 初版建立。定義檢索品質標準與 output contract。
---
（system prompt 內容）
```

欄位說明：`name` / `description` 為 pi subagent 格式必填；`tools` / `model` 為啟動時組裝參數用；`version`（semver）與 `changelog`（多行，**最近一版在最上面**，說明改版原因）為本 repo 的改版追蹤慣例，每次調整 profile 必須更新。

**用法**：orchestrator 讀取 profile → 用 frontmatter 的 `model`（**存完整 `provider/model` 格式**）與 `tools` 組裝 `herdr_agent start` 的 `agentArgs`（`--model`、`-t`）；profile body 的 system prompt 內容透過 `prompt` 傳給 subagent（agentArgs 無法安全編碼多行字串）→ 任務完成後把經驗寫回 profile（改版迭代，記得更新 `version` 與 `changelog`）。

## 量身訂做參數（agentArgs，實測有效）

| 參數 | 用途 |
|---|---|
| `--append-system-prompt <text>` | 附加身份/規則（不取代預設） |
| `--system-prompt <text>` | 完全取代預設 system prompt |
| `-t <tools>` | 工具白名單（如 `-t read`） |
| `--skill <path>` | 強制載入指定 skill |
| `--model <pattern>` | 指定模型（完整 `provider/model`；未指定時依 `PI_MODEL_*` env 選用，見「Subagent model 選擇與 fallback」） |

原則：subagent 只需要任務相關的工具與身份，**不要背多餘上下文**。

> ⚠️ **agentArgs 安全限制（實測踩過）**：`agentArgs` 必須能安全編碼給目標 shell——**多行字串、引號、特殊字元會讓 `start` 直接失敗**（`agent arguments cannot be encoded safely for the target shell`）。因此：
> - agentArgs 只放單行、無特殊字元的參數（`-t read,bash`、`--model …`）
> - **身份、任務規則、output contract 一律透過 `herdr_agent prompt` 傳遞**，不要塞進 agentArgs
> - `--model` 必須用完整 `provider/model` 格式（如 `provider/model`）；只寫 `model` 在多家 provider 都認證時會因歧義啟動失敗

## 並行與安全規則

- **劃分檔案範圍**：同 repo 並行改檔時，明確指定「你只能動哪個檔案」，避免互踩（worktree 無法避免 merge 衝突，只能減少）
- **git 規則分兩種模式**：
  - **worktree 模式**（git repo 並行改檔）：subagent 只能在自己的 branch/worktree 內 commit；禁止碰 main、其他 branch、`git push` 與 `git worktree` 管理指令
  - **無 worktree 模式**（小任務、非 git repo）：subagent 一律禁止 git 操作，由 orchestrator 統一 commit
- **資源**：並行數量受 pane 空間與機器負載限制；避免同方向連續 split 造成太窄
- **不依賴另一個 client 的焦點 pane**：一律用 `--current`、明確 pane id、或唯一 agent 名稱
- **ID 不猜測**：從 tools 回傳的 JSON 讀取 opaque ID（workspace/tab/pane），不要自行推斷

## 時機判斷速查

| 情境 | 動作 |
|---|---|
| 多個獨立任務 | 並行分派（git repo 改檔 → worktree 工作流） |
| try & error（關鍵字/參數） | 分派多路線探索，各給不同策略 |
| 長文研讀只要結論 | 分派黑箱研究，要求結論 + output contract |
| 大 token 消耗工作 | 分派隔離，保護 orchestrator context |
| 小任務 / 依賴鏈 / 需一致風格 | 自己做 |
