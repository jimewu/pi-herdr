---
name: herdr-with-pi
description: "以 Herdr 為基礎的多 agent 協作策略層（herdr-with-pi）。當任務可拆成多個獨立子任務、需要並行探索（try & error）、只要結論不需過程、或想隔離高 token 消耗工作時，建議使用 Herdr 分派 subagent（透過 pi-herdr extension 的 herdr_spawn tool，或需要多輪對話時退回到 herdr_layout / herdr_pane / herdr_agent tools）。需要 HERDR_ENV=1。"
---

# Herdr 多 agent 協作（策略層）

本 skill（herdr-with-pi）是 [pi-herdr](https://github.com/ogulcancelik/pi-herdr) extension（`herdr_spawn` / `herdr_layout` / `herdr_pane` / `herdr_agent` tools）的**策略層**：tools 提供執行能力，本 skill 說明**何時用、怎麼組合、以及 subagent 的分派方式**。兩者搭配使用。

## 核心原則：用 `herdr_spawn` 減少選項，提高遵從度

`herdr_spawn` 是分派 subagent 的**首要工具**，將原本 5-6 步的手動流程（layout → start → prompt → wait → read → close）濃縮為**一次呼叫**。

- **預設就是正確行爲**：tab 模式（`pane_mode=false`）、完工自動關閉（`keep_alive=false`）、model 從 `PI_MODEL_DEFAULT` 讀取
- **agent 要犯錯得刻意 opt-in**：不是因爲忘記做某步驟而犯錯
- **多輪對話**：設 `keep_alive=true`，再透過 `herdr_agent prompt/read` 進行後續回合，最後 `herdr_pane close` 關閉
- **只在需要特殊拓樸或控制時**才退回到 `herdr_layout` / `herdr_pane` / `herdr_agent` 手動操作

## 執行前檢查

- `HERDR_ENV=1` 且 `HERDR_PANE_ID` 已設定：確認自己跑在 Herdr 管理的 pane 內（同 extension 的啟動條件）。若否，停止。
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

## 非交互批量任務：headless `pi --print` vs herdr

上面四個「建議分派」條件滿足**但不需要對話**的子任務——純機械式「進 prompt → 出檔 → 結束」
（如 chunk 翻譯、格式轉換、批量抽取、批量驗證）——**不用 herdr pane，用 headless**：

```bash
pi --print --model <model> --thinking <level> -t read,write -p "<自包含任務+output contract>" \
  > job.out 2> job.err   # rc + 輸出檔就是全部訊號
```

理由（實測 13 個 chunk 的批量翻譯，0 次 lifecycle 問題）：

- herdr 的 lifecycle 狀態偵測（idle/blocked/done）是為**要對話**的 agent 設計的；純批處理
  佔用 pane + 狀態解析是純粹的額外成本，background 失敗處理也更簡單（rc + status 檔）
- headless 沒有 TUI/alternate-screen 問題，輸出直接進檔，orchestrator 讀檔驗證即可
- **多 chunk 編排**：同檔串行（工具鎖）/跨檔並行，用 `nohup` + 小 chain 腳本（依序跑
  `pi --print`、rc!=0 即 ABORT、每步寫 status 檔），orchestrator 定期 `tail` status

**邊界判斷**：需要多輪追問/探索失敗後改策略 → herdr（`herdr_spawn`，`keep_alive` 視情況）；
一次 prompt 就結束、輸出是檔案 → headless。兩者不互斥：同一任務可混合（研究用 herdr，
批量套用用 headless）。

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

### 2. 分派（主要方式：`herdr_spawn`）

```json
// 一次呼叫完成所有步驟：layout → start → prompt → wait → read → close
{
  "name": "<唯一小寫名>",
  "prompt": "<任務描述、規則、output contract>",
  "tools": "read,bash,edit,write",
  "model": "<依 PI_MODEL_* env 選用>",
  "thinking": "<依 herdr_thinking 建議選用>",
  "packages": ["<需要的 pi package 名稱>"],
  "pane_mode": false,
  "keep_alive": false,
  "cwd": "<worktree 路徑（如需要）>"
}
```

**分派並行任務**：同時呼叫多個 `herdr_spawn`（各自不同 name）。

> 使用者明確指定 pane 模式時，才設 `pane_mode: true`。

### 2b. 分派（替代方式：多輪對話）

當需要與 subagent 進行**多輪來回溝通**時（例如：先問問題、根據回答再追問），用 `keep_alive: true`：

```json
// 第一輪：spawn 並保持存活
{
  "name": "<唯一小寫名>",
  "prompt": "<初始任務>",
  "keep_alive": true
}

// 後續輪次：使用 herdr_agent 進行多輪對話
{ "action": "prompt", "target": "<name>", "prompt": "<追問內容>", "wait": true }
{ "action": "read", "target": "<name>" }

// 結束後手動關閉
{ "action": "close", "pane": "<pane id>" }  // herdr_pane
```

### 3. 監督

- `herdr_agent wait <target>`：等 lifecycle 穩定（idle/done/blocked）
- `herdr_agent read <target>`：讀輸出。**wait 立即返回 idle 不代表完成**——以 read 的實際內容為準
- read 收不到完整輸出（alternate screen）時：叫 subagent 把完整結果寫成 Markdown 檔回報路徑，再直接讀檔案
- `herdr_pane wait_output`：等一般命令的輸出（測試、server、build）

### 4. 收尾

- orchestrator 親自驗證產出（讀 diff、跑測試）。git repo 內改 code 的任務走 **worktree 工作流**（見下節）：review 通過才 merge，然後**關 pane + 刪 worktree & branch**；不走 worktree 的小任務由 orchestrator **統一 commit**（subagent 不碰 git）
- **完工即關閉（預設）**：`herdr_spawn` 預設會自動關閉。若用 `keep_alive=true`，記得手動 `herdr_pane close`
- 不要關閉自己所在的 pane（tool 會拒絕）；不要關閉不是自己創建的 pane，除非使用者明確要求

## `herdr_spawn` 工具參數一覽

| 參數 | 類型 | 預設值 | 說明 |
|------|------|--------|------|
| `name` | string | **必填** | 唯一 agent 名稱（小寫字母數字+連字號/底線） |
| `prompt` | string | **必填** | 初始任務（身份、規則、output contract 放這裡） |
| `kind` | string | `"pi"` | Agent kind |
| `tools` | string | `"read,bash,edit,write"` | 內建工具白名單 |
| `model` | string | `PI_MODEL_DEFAULT` env | 完整 `provider/model` 格式 |
| `thinking` | string | 依 herdr_thinking 建議 | `off/minimal/low/medium/high/xhigh/max` |
| `packages` | string[] | `[]` | Pi package 名稱（透過 `PI_PACKAGES_DIR` 解析） |
| `cwd` | string | caller's cwd | 工作目錄（worktree 路徑） |
| `pane_mode` | boolean | `false` | `true`=pane_split（右側分割），`false`=tab_create（預設） |
| `keep_alive` | boolean | `false` | `true`=保留 pane 供多輪對話，`false`=完工自動關閉 |
| `timeout` | integer | `300000` | 單次 prompt 的超時毫秒數（最小 30000） |

### 使用原則

1. **預設值就是正確行爲**：`pane_mode=false`（tab 模式）、`keep_alive=false`（自動關閉）——只有在使用者明確要求時才改
2. **profile 的 `tools` 值填入 `herdr_spawn.tools`**：先 `herdr_profile read` 讀取 profile，用其 `tools` 值
3. **model 從 `PI_MODEL_DEFAULT` 讀取**：`herdr_spawn` 會自動讀取，不需手動傳；需 fallback 時才手動傳 `model` 參數
4. **thinking level 先問 `herdr_thinking`**：呼叫 `herdr_thinking advise` 取得建議的 `--thinking` 值
5. **pi packages 先 `herdr_package list` 再傳 `packages`**：`herdr_spawn` 會自動解析並加 `-e` 參數
6. **多輪對話用它，不是用 `keep_alive=false` 再重複 spawn**：設 `keep_alive=true`，走 `herdr_agent prompt/read` 多輪

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
// 用 herdr_spawn 指定 cwd 指向 worktree，herdr_spawn 自動處理 topology 和生命週期
{
  "name": "<agent-name>",
  "prompt": "<任務>",
  "cwd": "<repo>/.herdr-wt/<agent-name>",
  "keep_alive": false
}
```

> 使用者明確指定 pane 模式時，才加 `"pane_mode": true`。

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

subagent 啟動時用的 model 由 env 變數決定（**只影響 subagent，不影響 orchestrator 自己的 model**）。**本 skill 一律讀取變數、不硬編碼具體模型**——變數由使用者在 shell 啟動設定檔 export（例如 `~/.bashrc`；source 或重開後生效）：

| env 變數 | 用途 |
|---|---|
| `PI_MODEL_DEFAULT` | 一般 subagent 的預設 model |
| `PI_MODEL_FALLBACK_HIGH` | 品質優先 / 需長上下文的 model（通常單一併發） |
| `PI_MODEL_FALLBACK_BULK` | 大量並行、品質要求普通的 model（通常多併發） |

**啟動任何 subagent 前，一律先讀取變數**。`herdr_spawn` 會自動讀取 `PI_MODEL_DEFAULT`，不需手動傳 `model` 參數。

```bash
echo $PI_MODEL_DEFAULT $PI_MODEL_FALLBACK_HIGH $PI_MODEL_FALLBACK_BULK
```

任一變數未設定時：**停止分派並請使用者設定**（寫進 shell 啟動設定檔後重開 pane 或 source），不要自行猜測或硬編碼模型名稱。

**選用規則（兩階段，順序不可顛倒）**：

1. **`PI_MODEL_DEFAULT` 可用** → **一律只用 `PI_MODEL_DEFAULT`**，不考慮 fallback
2. **僅當 `PI_MODEL_DEFAULT` 不可用**（`start` 失敗、provider 錯誤、subagent blocked、服務不可達）→ 依**任務類型與併發狀況**選：
   - 單一品質關鍵任務 / 需要長上下文（超出 BULK 的 context 上限）→ `PI_MODEL_FALLBACK_HIGH`
   - 大量並行 subagent / 品質要求普通 → `PI_MODEL_FALLBACK_BULK`（HIGH 若單一併發，並行全丟會排隊）

注意：
- `--model` 一律用完整 `provider/model` 格式（見「量身訂做參數」的 ⚠️ 警告）——env 值本身應存完整格式
- 用 BULK 前先確認任務不超過該 model 的 context / 輸出上限（依環境實測）
- shell 啟動設定檔只對**新開的 pane** 生效；已開的 pane 要 `source ~/.bashrc`（或對應檔案）或重開
- **選好 model 之後，再依任務難度設定 `--thinking`**（見下一節「Subagent thinking level 選擇」）——thinking 的「有效 level」因 model 而異，順序不能反
- **`herdr_spawn` 自動讀取 `PI_MODEL_DEFAULT`**：預設不需手動傳 `model` 參數；需要 fallback 時才手動傳入

## Subagent thinking level 選擇（依任務難度 × model 特性）

subagent 的 thinking level 在 `herdr_agent start` 的 `agentArgs` 加 `--thinking <level>` 設定（pi 目前**沒有** `/thinking` 指令；spawn 後只能靠 TUI Shift+Tab 手動改，headless 流程以 spawn 時設定為準）。**第一步：先依「Subagent model 選擇與 fallback」決定 model，再呼叫 `herdr_thinking` tool**——把 model 與任務難度丟進去，會回傳建議的 thinking level 與 `--model`/`--thinking` agentArgs，直接併入 `herdr_agent start`（與 `-t`、`-e` 併排）。下表是 tool 不可用時的參考（同樣以**能力類別**描述，不列具體 model 名稱與測量數據）。

### model 能力類別 × thinking 特性

| 能力類別 | off | 深度 level | 注意事項 |
|---|---|---|---|
| 支援完整深度階梯的 model（深度 = thinking budget） | ✅ 有效（think=0） | ✅ 各 level 對應不同預算上限（settings 的 `thinkingBudgets`；xhigh/max 併入 high） | 預算過低時 hard 題品質會掉（品質懸崖）；預算越高時間越長、邊際效益遞減——**越久不一定越準** |
| 僅支援 on/off 的 model | ✅ 有效，但**算術類任務誤算風險高** | ❌ 深度參數被接受但不調整 | 品質優先時只能用 on（hard 題很慢）；時間優先時 off |
| gateway 強制 thinking 的 model | ❌ 無效（關不掉） | 深度差異小（主要影響費率） | 選低 level 即可省錢 |

### 難度 → thinking level 決策表（通常準則）

| 任務難度 | 例子 | 建議 level |
|---|---|---|
| 機械/例行 | 目錄探查、格式轉換、關鍵字搜尋、簡單 Q&A | `off`（僅 on/off 的 model 遇算術任務改用 `minimal`/on） |
| 一般 | 文獻檢索多輪嘗試、中等 code 修改、文件摘要 | `minimal`~`low` |
| 複雜 | 跨檔案重構、設計決策、長文分析 | `medium`~`high` |
| 品質關鍵/難題 | code review 深度審查、演算法實作、多步驟規劃 | `high`（僅 on/off 的 model 只能用 on） |

實際選用：品質優先 → 高一階；時間/cost 優先 → 低一階。**不要對不支援的 model 硬設高 level**——例如僅 on/off 的 model 設 xhigh 會被 clamp 到 high，等同 on，毫無意義；gateway 強制 thinking 的 model 設 off 無效。

### 能力表在哪、如何查詢已知模型

- 能力表位置由固定 env **`PI_THINKING_CLASSES`** 決定（寫在 shell 啟動設定檔（例如 `~/.bashrc`，source 或重開後生效）；未設定時回退 `<repo>/agents/thinking-classes.json`，該路徑已 gitignored）。完整 env 清單見 README → *環境變數*。
- **spawn 前先查**：`echo $PI_THINKING_CLASSES` 確認位置；`herdr_thinking` action=`list` 列出已知 model（含類別與驗證描述）；對特定 model 不確定時 action=`advise` 直接問建議 level。
- 表檔是環境實測資料（local-only、勿 commit）；格式參考公開的 `agents/thinking-classes.example.json`。

### 未識別 model：probe → record（一次實測，永久生效）

`herdr_thinking` 對查無能力資料的 model 回報 `unknown`，附保守預設與 probe 指示。此時跑一次**最小實測**、再把結果**寫回能力表**（`agents/thinking-classes.json`，`record` action 寫入，路徑可被 `PI_THINKING_CLASSES` 覆寫；已記錄的 model 之後直接查表、不再需要 probe）。**能力表是環境實測資料，已加入 `.gitignore`（local-only、不要 commit）**——格式參考公開的 `agents/thinking-classes.example.json`，想完全移出 repo 就把 `PI_THINKING_CLASSES` 指向私人路徑：

```bash
# probe：一次 one-shot 呼叫，確認 --thinking off 是否真的關掉思考
pi --no-tools --model <model> --thinking off -p "<簡單問題>"
# 讀 session transcript：off 之後若仍出現 reasoning 內容 → gateway-forced；
# 完全沒有 reasoning → 該 model 支援 off（再依深度參數是否有效分 on-off / budget-ladder）
```

查證完成後：

```json
{ "action": "record", "model": "<bare model id，勿含 provider/gateway 前綴>", "class": "on-off|budget-ladder|gateway-forced", "evidence": "如何驗證的（通用描述，勿含機器資訊）" }
```

之後 `advise` 同一 model 直接取表，附註 `class from capability table`。能力表是 repo 資產，record 產生的改動由 orchestrator 正常 commit。

### 範例

```json
// 使用 herdr_spawn：herdr_spawn 會自動讀取 PI_MODEL_DEFAULT 並設定 --model
{
  "name": "sb-review",
  "prompt": "Review the code diff...",
  "tools": "read,bash",
  "thinking": "high"
}

// 使用 herdr_agent start（特殊情況）：
{ "action": "start", "name": "sb-review", "kind": "pi", "pane": "<p1>",
  "agentArgs": ["-t", "read,bash", "--model", "<依 PI_MODEL_* 選用>", "--thinking", "high"]
}

## Subagent profiles（agents/ 目錄）

本 repo 的 `agents/*.md` 是已建置好的 subagent 設定（資產），避免每次重新構思。格式為 YAML frontmatter + body：

```markdown
---
name: lit-searcher
version: 0.1.0
description: 文獻檢索助理（PubMed 等），擅長關鍵字策略反覆嘗試
tools: read, bash
changelog: |
  - 0.1.0: 初版建立。定義檢索品質標準與 output contract。
---
（system prompt 內容）
```

欄位說明：`name` / `description` 為 pi subagent 格式必填；`tools` 為啟動時組裝 `-t` 工具白名單用（pi packages **不由 profile 寫死**——由 main agent 依當前任務動態決定，見「Subagent 工具配置（pi packages）」）；`model` **可省略**——若填僅為提示，實際值一律由 orchestrator 依 `PI_MODEL_*` env 選用（見「Subagent model 選擇與 fallback」），**不得硬編碼具體模型**；`version`（semver）與 `changelog`（多行，**最近一版在最上面**，說明改版原因）為本 repo 的改版追蹤慣例，每次調整 profile 必須更新。

**用法**：orchestrator 讀取 profile → 用 frontmatter 的 `tools` 填入 `herdr_spawn` 的 `tools` 參數；`--model` 由 `herdr_spawn` 自動從 `PI_MODEL_DEFAULT` 讀取；profile body 的 system prompt 內容透過 `herdr_spawn` 的 `prompt` 參數傳給 subagent → 任務完成後把經驗寫回 profile（改版迭代，記得更新 `version` 與 `changelog`）。

### 選擇與建立（用 or 建）

啟動任何 subagent 前，**一律先檢查 `agents/` 裡有無「完全適用」的 profile**（`herdr_profile list`）：

1. `herdr_profile list` 列出所有既有 profile（name / version / description / tools）
2. **完全適用**才可直接使用——判定標準（**全部符合才算**，缺一即不適用）：
   - **領域/語言精確一致**：profile 的 description 與任務的領域、語言、技術棧吻合（例如 `R 語言專家` profile 對 `C# 專家` 任務**不適用**）
   - **職責吻合**：任務型別與 profile 定義的職責一致（黑箱研究、code review、文獻檢索…）
   - **工具足夠**：profile 的 `tools` 涵蓋任務所需工具；任務需要但 profile 沒有的工具 → 不適用
   - 只要有任一明顯落差 → **不算適用**
3. **有完全適用** → `herdr_profile read <name>` 讀取內容，用 frontmatter `tools` 填入 `herdr_spawn` 的 `tools` 參數、body 作為 `prompt`
4. **沒有完全適用** → `herdr_profile create` **依需求撰寫新 profile** 寫入 `agents/`（name 小寫短 id；description 精確描述適用範圍；tools 逗號分隔工具白名單；body 為 system prompt，含職責與 output contract），**然後用 `herdr_spawn` 搭配新 profile spawn subagent**
5. 新 profile 建立後即成為資產：**下次同型別任務直接適用**，不需要重建

> 不要「將就」使用相近但不適用的 profile（例如用 R 專家 profile 去接 C# 任務）——以「任務與 profile 描述完全一致」為適用標準。

範例：
- 既有 `r-expert`（R 語言專家），任務是「寫 C# 程式」→ R profile 領域不符 → **create `csharp-expert`**
- 既有 `lit-searcher`（PubMed 文獻檢索），任務是「PubMed 檢索」→ 完全適用 → **直接使用**

### Subagent 工具配置（pi packages）

目標：**subagent 只載入任務真正需要的工具資源**——內建工具由 profile 的 `tools` 白名單規範；pi packages（skills/tools）則由 **main agent 依當前任務動態決定**，不寫死在 profile（pi package 目錄經常變動，寫死容易過時）。不需要的 package 一律不掛，避免多餘 skill/tool 分散注意力、空耗 context。

- 發現目錄由 env `PI_PACKAGES_DIR` 設定（export 在 shell 啟動設定檔，例如 `~/.bashrc`；值指向你的 pi packages 目錄，例如 `/path/to/pi-packages`）
- **spawn 前（動態決定）**：
  1. `herdr_package list` 查看 `PI_PACKAGES_DIR` 當下有哪些 packages（name / description / keywords）
  2. 依**當前任務**選擇需要的 package(s)（不寫入 profile frontmatter）
  3. `herdr_package resolve` 把名稱解析為 `-e <dir>` 路徑
  4. 將 package 名稱傳給 `herdr_spawn` 的 `packages` 參數（`herdr_spawn` 會自動解析並加 `-e` 參數）；若需手動 `herdr_agent start`，`agentArgs` 放入 `-e <dir>`（每個 package 一組 `-e`；單行、無特殊字元，符合「量身訂做參數」的 agentArgs 安全限制）
  5. resolve 回報 missing 的 package 直接跳過，spawn 照常進行
- **`PI_PACKAGES_DIR` 未設定**（或為空）：不掛載任何 package，照常 spawn——profile 的 `tools` 白名單（`-t`）仍適用

```json
// spawn 前動態掛載（$PI_PACKAGES_DIR 已設定，任務需要某個 skill package）
// 1. herdr_package list → 找到 book-to-skill
// 2. 將 package 名稱傳給 herdr_spawn 的 packages 參數
{
  "name": "sb1",
  "prompt": "...",
  "packages": ["book-to-skill"]
}

// 手動方式（需特殊控制時）：
// 1. herdr_package list → 找到 book-to-skill
// 2. herdr_package resolve ["book-to-skill"] → -e <resolve 回傳的真實路徑>
{
  "action": "start", "name": "sb1", "kind": "pi", "pane": "<p1>",
  "agentArgs": ["-t", "read,bash", "-e", "<resolve 回傳的路徑>", "--model", "<依 PI_MODEL_*>選用>"]
}
```

注意：
- 文檔中的路徑皆為範例，**skill 不硬編碼任何具體路徑/模型**——一律讀 `PI_PACKAGES_DIR`
- shell 啟動設定檔只對**新開的 pane** 生效（同「Subagent model 選擇與 fallback」的注意事項）
- 動態選用 packages 時**只挑任務真正需要的**：subagent 掛載的額外資源越少，context 越省

## 量身訂做參數（agentArgs，實測有效）

| 參數 | 用途 |
|---|---|
| `--append-system-prompt <text>` | 附加身份/規則（不取代預設）；**僅限單行簡短文字**（見 ⚠️ 安全限制） |
| `--system-prompt <text>` | 完全取代預設 system prompt；**僅限單行簡短文字**（見 ⚠️ 安全限制） |
| `-t <tools>` | 工具白名單（如 `-t read`） |
| `--skill <path>` | 強制載入指定 skill |
| `-e <dir>` | 載入 pi package（extension/skill）；依任務動態指定（見「Subagent 工具配置（pi packages）」） |
| `--model <pattern>` | 指定模型（完整 `provider/model`；未指定時依 `PI_MODEL_*` env 選用，見「Subagent model 選擇與 fallback」） |
| `--thinking <level>` | 指定 thinking level（`off/minimal/low/medium/high/xhigh/max`；依任務難度 × model 特性選用，見「Subagent thinking level 選擇」） |

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
| 長文研讀只要結論、**不需人工監看過程** | **`oneshot`**（最輕：無 pane、無 lifecycle 開銷、直接回傳文字結論） |
| 長文研讀只要結論、但**使用者可能想觀摩或中途介入** | `herdr_spawn`（可觀看的 tab／pane，可 `keep_alive` 追問） |
| 大 token 消耗工作 | 分派隔離，保護 orchestrator context |
| **非交互批量（進 prompt→出檔→結束）** | **headless `pi --print`**，不佔 herdr pane（見上節） |
| 小任務 / 依賴鏈 / 需一致風格 | 自己做 |

### `oneshot` vs `herdr_spawn` 的邊界（兩者都是 pi agent）

兩者本質相同（都是 pi agent、綁定 API model、隔離 context），差別在**有無可觀摩的終端
與 lifecycle**：

| | `oneshot` | `herdr_spawn` |
|---|---|---|
| 終端 pane | 無 | 有（tab 或 pane，可即時觀看） |
| lifecycle 狀態 | 不適用（呼叫→回傳） | idle／working／blocked／done，需解析 |
| 多輪追問 | ✗ 單次 | ✓ `keep_alive=true` + `herdr_agent prompt` |
| 中途介入／觀察 | ✗ | ✓ 使用者可切到該 tab 看 |
| 成本 | 最低 | 需 layout 管理與狀態解析 |
| 適用 | 一问一答、只要結論、過程不需人看 | 需要監看、追問、或使用者可能想接手 |

> **為何這條重要**：若速查表只有 `herdr_spawn` 而無 `oneshot`，agent 看到「黑箱研究只要結論」
> 時會**繞過本 skill 的決策框架**、預設走 oneshot，等於策略層在此失靈。把三個委派選項
> （oneshot / herdr_spawn / headless）都列進矩陣，委派決策才會**被框架引導過**。

**三者不互斥**：同一任務可混合——研究用 `oneshot` 並行開幾路，需要監看的長任務用
`herdr_spawn`，批量套用用 headless。

## 審查 / 產物檢查型 subagent（文件、輸出物、黑箱驗收）

當任務是「檢查文件/產物並回報問題」時，除了一般分派原則，注意：

**1. Prompt 內嵌「工具顯示限制」（避免誤報）**
Subagent 檢查 docx/PDF/ODS 等二進位產物時，常用 pandoc/unzip/grep 這些「顯示受限」的工具，容易把工具限制當成內容缺失而下錯結論。任務說明應預先告知已知 gotcha，例如：
- pandoc 讀 docx：`\@ref`/TOC/表格編號等 Word fields 未計算時顯示空白 → 空白是正常，不是失敗
- `block_pour_docx` 嵌入的 altChunk 內容 pandoc 看不到 → 用 unzip 確認 `word/cer_*.docx` 存在，或視為「無法以此工具驗證」
- grid/pipe table 的 cell 內容在 pandoc plain 會斷行 → 跨行比對時小心
- 要求：對「工具顯示受限而無法確認的項」，一律標「存疑」並說明理由，不要下「缺失/錯誤」結論

本次實例：審查型 agent 誤報 3 項（field 空白當渲染失敗、altChunk 內圖面當「不存在」、表格跨行 B-number 對照錯亂），主 agent 逐一驗證後全部推翻，浪費大量 token。

**2. 大型審查先預篩、後分派（硬性規則）**

全文件/大目錄的「機械式檢查」（殘留字串、跨檔一致性的數字、grep 可完成的檢查）先用主 agent 自己 grep 預篩，把「需要推理的項」（是否符合某標準、某段語意是否支持某宣稱、兩文件敘述是否矛盾）才丟給 subagent；或把審查拆成多個聚焦任務（數字一致性 / 引用 / verbatim / 格式各一）。單一 subagent 跑全部會燒掉大量 token（實例：一台文件飛行檢查用了 ~4M+ tokens 尚未完成）。

> ### ⚠ 這條不只是省 token——是**正確性**要求
>
> **LLM 數不準。** 實測案例：報告摘要寫「11 🟢／15 🟡／6 🔴／3 ⚪」，實際逐列清點是
> 「9／18／5／2」——**三個數字全錯**。兩輪 LLM reviewer 都沒抓到，腳本 0.1 秒對完。
>
> 讓 reviewer 去數數字等於**沒查**：它會給出一個看似合理但未經清點的結論，而這個結論會被
> 當成已驗證。因此下列項目**必須由 orchestrator 用腳本先跑完並修正，才委派 reviewer**：
>
> | 確定性檢查 | 工具 |
> |---|---|
> | 計數斷言（燈號／項數／總和） | 腳本逐列重算，與摘要對照 |
> | 引用雙向覆蓋（每個 label 有 pattern、每個 pattern 被用到） | 腳本 |
> | HTML 標籤平衡（用 parser，**不用 regex**） | 腳本 |
> | TOC 與 section id 對齊 | 腳本 |
> | 非讀者語言引文是否均有全文翻譯 | 腳本（按碼位範圍） |
>
> 現成工具：`skill-regulatory-report-writing/templates/verify_report.js` 與
> `verify_report.py`（已拿實際報告驗證通過）。任何產出 HTML 報告的任務都應先跑過再委派。
>
> **委派時要在 prompt 告知 reviewer「確定性檢查已完成」**，避免它重複去數已算過的東西、
> 或把腳本已修的事實當成問題回報。
