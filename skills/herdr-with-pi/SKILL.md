---
name: herdr-with-pi
description: "以 Herdr 為基礎的多 agent 協作策略層（herdr-with-pi）。當任務可拆成多個獨立子任務、需要並行探索（try & error）、只要結論不需過程、或想隔離高 token 消耗工作時，建議使用 Herdr 分派 subagent（透過 pi-herdr extension 的 herdr_layout / herdr_pane / herdr_agent tools）。需要 HERDR_ENV=1。"
---

# Herdr 多 agent 協作（策略層）

本 skill（herdr-with-pi）是 [pi-herdr](https://github.com/ogulcancelik/pi-herdr) extension（`herdr_layout` / `herdr_pane` / `herdr_agent` tools）的**策略層**：tools 提供執行能力，本 skill 說明**何時用、怎麼組合、以及 subagent 的分派方式**。兩者搭配使用。

## 執行前檢查

- `HERDR_ENV=1`：確認自己跑在 Herdr 管理的 pane 內。若否，停止。
- `herdr_agent list`：確認現有 agent 狀態，避免名稱衝突、重複啟動。
- **版面模式**：預設 tab 模式（每 agent 一 tab）；只有使用者明確指定時才用 pane 模式（見「版面配置慣例」）
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

**預設採用 tab 模式**：每個 agent（main + 每個 subagent）都在**同一個 workspace 下各自的 tab**。只有使用者**明確指定**要 pane 模式時，才改用「左主右子」分割。**agent 不自行偵測畫面大小**——選哪種模式由使用者決定。

### 模式 A：tab 模式（預設）

- main agent 留在自己原本的 tab；每個 subagent 用 `tab_create` 開新 tab（`label` 用 agent 名），該 tab 的 root pane 就是 subagent 的 pane
- 畫面永遠只顯示一個 pane（切 tab 監看），小螢幕不會因為 pane 切割而擠爆；不需要 split / ratio
- 並行 N 個 subagent = 開 N 個 tab（連同 main agent 共 N+1 個 tab）

```json
// 例：2 個並行 subagent（workspace = 主 agent 所在的 workspace id）
{ "action": "tab_create", "workspace": "<ws>", "label": "demo-sub-1", "focus": false }  // → root pane <p1>
{ "action": "tab_create", "workspace": "<ws>", "label": "demo-sub-2", "focus": false }  // → root pane <p2>
// 之後在 <p1> / <p2> 上 herdr_agent start 啟動各 subagent
```

注意：
- tab id / pane id 一律從 `tab_create` 回傳結果讀取，不要自行推斷
- `tab_create` 預設同 cwd、不搶焦點；需要指定 cwd（如 worktree）時傳 `cwd`

### 模式 B：pane 模式（僅在使用者明確指定時使用）

左主右子：orchestrator（主 agent）**永遠佔整個畫面左半邊（50%）**，subagent 在右半邊**等分**排列（第一個最上方，依序向下）。

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
{ "action": "current" }                           // herdr_layout：確認目前 workspace（tab 模式開 tab 要用）
```

### 2. 分派

```json
// herdr_layout：開新 tab 給 subagent（預設 tab 模式；同 workspace、同 cwd、不搶焦點）
{ "action": "tab_create", "workspace": "<主 agent 所在 workspace>", "label": "<agent 名>", "focus": false }
// ↑ 回傳的 root pane 即 subagent 的 pane

// herdr_agent：啟動 subagent。agentArgs 只放單行安全參數（見「量身訂做參數」的 ⚠️ 警告）
{
  "action": "start",
  "name": "<唯一小寫名>",
  "kind": "pi",
  "pane": "<新 tab 的 root pane id>",
  // model 依 PI_MODEL_* env 選用（見「Subagent model 選擇與 fallback」），啟動前先讀實際值
  "agentArgs": ["-t", "read,bash", "--model", "<依任務型別選出的 provider/model>"]
}

// herdr_agent：派任務，等結果。身份/規則/output contract 一律放這裡，不要塞 agentArgs
{ "action": "prompt", "target": "<name>", "prompt": "…", "wait": true, "timeout": 300000 }
```

> 使用者明確指定 pane 模式時，才改為 `pane_split` 開 sibling pane（見「版面配置慣例」模式 B）。

**分派並行任務**：一次同時送出多個 prompt（各自不同任務），並行 wait。

### 3. 監督

- `herdr_agent wait <target>`：等 lifecycle 穩定（idle/done/blocked）
- `herdr_agent read <target>`：讀輸出。**wait 立即返回 idle 不代表完成**——以 read 的實際內容為準
- read 收不到完整輸出（alternate screen）時：叫 subagent 把完整結果寫成 Markdown 檔回報路徑，再直接讀檔案
- `herdr_pane wait_output`：等一般命令的輸出（測試、server、build）

### 4. 收尾

- orchestrator 親自驗證產出（讀 diff、跑測試）。git repo 內改 code 的任務走 **worktree 工作流**（見下節）：review 通過才 merge，然後**關 pane + 刪 worktree & branch**；不走 worktree 的小任務由 orchestrator **統一 commit**（subagent 不碰 git）
- **完工即關閉（預設）**：subagent 任務完成、orchestrator 讀取並驗證結果後，**立即 `herdr_pane close <pane id>` 關閉**，回收 pane 空間（tab 模式下關閉該 tab 的 root pane 即可，tab 留空無妨）——**不要**保留已完成任務的 subagent，除非使用者明確要求保留（例如後續還要追問）
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
// 預設 tab 模式：開新 tab，cwd 指向 worktree
{ "action": "tab_create", "workspace": "<ws>", "label": "<agent-name>", "cwd": "<repo>/.herdr-wt/<agent-name>", "focus": false }
// 使用者指定 pane 模式時才改為：{ "action": "pane_split", "cwd": "<repo>/.herdr-wt/<agent-name>", "focus": false }
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

subagent 啟動時用的 model 由 env 變數決定（**只影響 subagent，不影響 orchestrator 自己的 model**）。**本 skill 一律讀取變數、不硬編碼具體模型**——變數由使用者在 `~/.profile` export（被 `~/.zshrc` source，新開的 pane 生效）：

| env 變數 | 用途 |
|---|---|
| `PI_MODEL_DEFAULT` | 一般 subagent 的預設 model |
| `PI_MODEL_FALLBACK_HIGH` | 品質優先 / 需長上下文的 model（通常單一併發） |
| `PI_MODEL_FALLBACK_BULK` | 大量並行、品質要求普通的 model（通常多併發） |

**啟動任何 subagent 前，一律先讀取變數**：

```bash
echo $PI_MODEL_DEFAULT $PI_MODEL_FALLBACK_HIGH $PI_MODEL_FALLBACK_BULK
```

任一變數未設定時：**停止分派並請使用者設定**（寫進 `~/.profile` 後重開 pane），不要自行猜測或硬編碼模型名稱。

**選用規則（兩階段，順序不可顛倒）**：

1. **`PI_MODEL_DEFAULT` 可用** → **一律只用 `PI_MODEL_DEFAULT`**，不考慮 fallback
2. **僅當 `PI_MODEL_DEFAULT` 不可用**（`start` 失敗、provider 錯誤、subagent blocked、服務不可達）→ 依**任務類型與併發狀況**選：
   - 單一品質關鍵任務 / 需要長上下文（超出 BULK 的 context 上限）→ `PI_MODEL_FALLBACK_HIGH`
   - 大量並行 subagent / 品質要求普通 → `PI_MODEL_FALLBACK_BULK`（HIGH 若單一併發，並行全丟會排隊）

注意：
- `--model` 一律用完整 `provider/model` 格式（見「量身訂做參數」的 ⚠️ 警告）——env 值本身應存完整格式
- 用 BULK 前先確認任務不超過該 model 的 context / 輸出上限（依環境實測）
- `~/.profile` 只對**新開的 pane** 生效；已開的 pane 要 `source ~/.profile` 或重開

## Subagent profiles（agents/ 目錄）

本 repo 的 `agents/*.md` 是已建置好的 subagent 設定（資產），避免每次重新構思。格式為 YAML frontmatter + body：

```markdown
---
name: lit-searcher
version: 0.1.0
description: 文獻檢索助理（PubMed 等），擅長關鍵字策略反覆嘗試
tools: read, bash
model: <由 PI_MODEL_* env 選用，勿硬編碼>
changelog: |
  - 0.1.0: 初版建立。定義檢索品質標準與 output contract。
---
（system prompt 內容）
```

欄位說明：`name` / `description` 為 pi subagent 格式必填；`tools` 為啟動時組裝參數用；`model` **可省略**——若填僅為提示，實際值一律由 orchestrator 依 `PI_MODEL_*` env 選用（見「Subagent model 選擇與 fallback」），**不得硬編碼具體模型**；`version`（semver）與 `changelog`（多行，**最近一版在最上面**，說明改版原因）為本 repo 的改版追蹤慣例，每次調整 profile 必須更新。

**用法**：orchestrator 讀取 profile → 用 frontmatter 的 `tools` 組裝 `herdr_agent start` 的 `agentArgs`（`-t`）；`--model` 一律依 `PI_MODEL_*` env 選用（見「Subagent model 選擇與 fallback」）；profile body 的 system prompt 內容透過 `prompt` 傳給 subagent（agentArgs 無法安全編碼多行字串）→ 任務完成後把經驗寫回 profile（改版迭代，記得更新 `version` 與 `changelog`）。

### 選擇與建立（用 or 建）

啟動任何 subagent 前，**一律先檢查 `agents/` 裡有無「完全適用」的 profile**（`herdr_profile list`）：

1. `herdr_profile list` 列出所有既有 profile（name / version / description / tools）
2. **完全適用**才可直接使用——判定標準（**全部符合才算**，缺一即不適用）：
   - **領域/語言精確一致**：profile 的 description 與任務的領域、語言、技術棧吻合（例如 `R 語言專家` profile 對 `C# 專家` 任務**不適用**）
   - **職責吻合**：任務型別與 profile 定義的職責一致（黑箱研究、code review、文獻檢索…）
   - **工具足夠**：profile 的 `tools` 涵蓋任務所需工具；任務需要但 profile 沒有的工具 → 不適用
   - 只要有任一明顯落差 → **不算適用**
3. **有完全適用** → `herdr_profile read <name>` 讀取內容，用 frontmatter `tools` 組裝 `herdr_agent start` 的 `agentArgs`、body 作為 `prompt`
4. **沒有完全適用** → `herdr_profile create` **依需求撰寫新 profile** 寫入 `agents/`（name 小寫短 id；description 精確描述適用範圍；tools 逗號分隔工具白名單；body 為 system prompt，含職責與 output contract），**然後用新 profile spawn subagent**
5. 新 profile 建立後即成為資產：**下次同型別任務直接適用**，不需要重建

> 不要「將就」使用相近但不適用的 profile（例如用 R 專家 profile 去接 C# 任務）——以「任務與 profile 描述完全一致」為適用標準。

範例：
- 既有 `r-expert`（R 語言專家），任務是「寫 C# 程式」→ R profile 領域不符 → **create `csharp-expert`**
- 既有 `lit-searcher`（PubMed 文獻檢索），任務是「PubMed 檢索」→ 完全適用 → **直接使用**

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
> - `--model` 必須用完整 `provider/model` 格式（如 `some-provider/some-model`）；只寫 `model` 名稱在多家 provider 都認證時會因歧義啟動失敗

## 並行與安全規則

- **劃分檔案範圍**：同 repo 並行改檔時，明確指定「你只能動哪個檔案」，避免互踩（worktree 無法避免 merge 衝突，只能減少）
- **git 規則分兩種模式**：
  - **worktree 模式**（git repo 並行改檔）：subagent 只能在自己的 branch/worktree 內 commit；禁止碰 main、其他 branch、`git push` 與 `git worktree` 管理指令
  - **無 worktree 模式**（小任務、非 git repo）：subagent 一律禁止 git 操作，由 orchestrator 統一 commit
- **資源**：tab 模式（預設）下並行數量受機器負載與 tab 數限制，不受畫面大小影響；pane 模式下受 pane 空間限制，避免同方向連續 split 造成太窄
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
