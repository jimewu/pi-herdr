---
name: plan-as-skill
description: "Plan-as-Skill 是「如何建立與執行 plan-skill」的 meta-skill。它定義了 plan-skill 的結構、progressive disclosure 原則、以及執行時的行前檢查、new commits 驗證、agent 拓樸設計、雙層驗收 endpoint 等規範。當你載入一個具體的 plan-skill（如 r9700-qwen3.8-sglang）時，那個 skill 才是要執行的計畫；本 skill 是你的參考手冊。"
metadata:
  version: 1.3.0
  mode: reference
  package: pi-herdr
  depends: herdr-with-pi
---

# Plan-as-Skill（Meta-Skill）

> ⚠️ **這是一個 meta-skill**，不是可執行的計畫。  
> 如果你載入本 skill 是為了執行某個具體任務，你可能載入錯了——請找 `skills/<plan-name>/` 下的具體 plan-skill。  
> 如果你是要建立一個新的 plan-skill，或想了解 plan-skill 的概念，請繼續閱讀。

---

## 什麼是 Plan-Skill？

Plan-as-Skill 是一套將**執行計畫編碼為 agent skill** 的方法論。一個 plan-skill 就是一個**可執行的計畫**——它是一個獨立的 skill，放在 `skills/<plan-name>/` 下，有自己的 `SKILL.md`，可以被 agent 載入後直接執行。

### 計畫與執行分離

```
[規劃階段: 由人 + agent 共同完成]          [執行階段: 由 agent 載入 plan-skill 執行]
  1. 確定 scope 與目標                      1. 載入 plan-skill → SKILL.md 就是入口
  2. 完整研究所有路徑缺口                    2. 行前檢查（環境狀態 + new commits）
  3. 設計 agent 拓樸與分工                  3. 依計畫逐步執行（progressive disclosure）
  4. 預先探索解法與陷阱                      4. 遇狀況 → 查 contingency
  5. 估算 token 成本與時間                   5. 寫 notes 回饋
  6. 跟 USER 討論、revise
  7. 定型 → 寫成 plan-skill（獨立 skill）
```

**關鍵原則**：所有探索、研究、檢索、解法驗證，都在規劃階段完成。執行階段只要確認前提仍成立，然後照計畫走。

---

## Plan-Skill 的目錄結構

一個 plan-skill 是一個獨立的 skill 目錄，遵循標準的 Agent-Skills 結構：

```
skills/<plan-name>/
├── SKILL.md              ← 入口：只揭露 Step 0（L0）
├── steps/                ← 各步驟詳細內容（L1，progressive disclosure）
│   ├── step_1.md
│   ├── step_2.md
│   ├── step_2a.md
│   ├── step_2b.md
│   └── ...
├── chk.json              ← 各步驟的 checkpoint 驗收定義（含 next_on_pass）
├── chk                   ← Go 編譯的 CLI 二進位檔（從 plan-as-skill 複製）
├── .chkstate.json        ← 執行狀態（自動產生，gitignored）
├── chapters/             ← 輔助章節（選擇性）
├── indexes/              ← 輔助索引
│   └── contingency.md    ← 已知陷阱與應變方案
└── notes/                ← 執行後的經驗回饋
```

### SKILL.md 的結構（一個 plan-skill 的入口）

當 agent 載入 plan-skill 時，SKILL.md 就是它的**行動指令**。但注意——**SKILL.md 只揭露 Step 0 的內容**，後續步驟在 `steps/step_<N>.md` 檔案中。這是 progressive disclosure 的核心：通過 chk 才能知道下一步看哪個檔案。

它應該包含：

```markdown
---
name: <plan-name>
description: "一句話說明這個計畫做什麼"
metadata:
  plan-date: YYYY-MM-DD
  package: <所屬 package>
  plan-skill: true          # 標記這是一個 plan-skill
  plan-as-skill-version: ">=1.3.0"  # 遵循的 meta-skill 版本
---

# <計畫名稱>

> ⚠️ 這是一個 plan-skill。你的任務是**執行這個計畫**。
> 本 SKILL.md 只揭露 Step 0 的內容。後續步驟在 `steps/step_<N>.md` 中，
> 由 `chk` 通過後指引你去看。

## Scope
明確的範圍與目標。

## 研究結論（已預先完成）
規劃時已經完成的研究結論，列出所有已知前提與證據來源。

## 需要的資源
環境變數、pi packages。

## 執行流程總覽
計畫的 roadmap 概覽（不揭露細節）。

## Step 0: 行前檢查
只有 Step 0 的內容在此。
→ 通過後 chk 告訴你下一步。

## Subagent 使用規範
遠端指令使用 ssh 前綴模式。

## 應變方案
## 執行後 Notes
```

---

## 如何建立一個 Plan-Skill

### 步驟 1：研究先行

在動手寫 plan-skill 之前，先完成所有研究：
- 使用 websearch、webfetch 等工具探索所有路徑
- 確認技術可行性和已知陷阱
- 如果有多個解決方案，評估優缺點

### 步驟 2：設計 Agent 拓樸

使用 `herdr-with-pi` 的 subagent 概念，設計誰做什麼：
- 哪些階段可以並行？
- 哪些階段需要獨立的 reviewer？
- 使用 worktree 模式還是小任務模式？

### 步驟 3：定義驗收標準 + 編號 + chk checkpoint + next_on_pass

每個階段都要有兩類驗收 endpoint：
- **Validation**: 滿足 USER 目標的標準
- **Verification**: 技術方案達標的標準

同時，每個步驟必須：
1. **編號**：使用 `0, 1, 2, 2a, 2b, 2b-1, 2b-2, ...` 格式，確保編號唯一且可排序
2. **定義 chk checkpoint**：在 `chk.json` 中為每個步驟定義 `expected_result`、`help`（含驗收清單）以及 `next_on_pass`（通過後指引下一步去哪個檔案）
3. **每個步驟結束點**：必須有 `chk --step <N> --result <CODE>` 作為強制閘門
4. **Progressive disclosure**：每個步驟的詳細內容放在獨立的 `steps/step_<N>.md` 檔案中，SKILL.md 只揭露 Step 0

### 步驟 4：找出 Pi Packages 資源

從 `PI_PACKAGES_DIR` 環境變數指定的路徑找出任務需要的 pi packages：

```bash
# 查看可用 packages
herdr_package list
# 選擇任務需要的 package
herdr_package resolve ["<package-name>"]
# 透過 -e <dir> 傳給 subagent
```

### 步驟 5：指定 Model 建議

指定每個階段的 model 等級（不指定具體 model 名稱）：
- `PI_MODEL_DEFAULT`：一般任務
- `PI_MODEL_FALLBACK_HIGH`：品質優先 / 長上下文
- `PI_MODEL_FALLBACK_BULK`：大量並行 / 品質普通

### 步驟 6：寫入 Plan-Skill

按照上述結構寫入 `skills/<plan-name>/` 目錄。

可以先讀取 `templates/plan-skill-template/SKILL.md` 了解一個 plan-skill 應該有哪些區塊，
然後根據你的研究結論填入對應內容。

寫完後，參考 `templates/README.md` 的檢查清單確認沒有遺漏。

### 步驟 7：建立 chk.json 與 chk binary

在 plan-skill 目錄下建立 `chk.json`，定義每個步驟的 checkpoint。`next_on_pass` 欄位是 progressive disclosure 的關鍵：當 agent 通過 chk 時，會顯示下一步要去哪個檔案。

```json
{
  "plan": "<計畫名稱>",
  "steps": {
    "0": {
      "title": "Step 0: 行前檢查",
      "expected_result": "PREFLIGHT_PASS",
      "next_on_pass": "請讀取 steps/step_1.md 開始下一步。",
      "help": "## Step 0: 行前檢查\n\n### 檢查清單\n- [ ] 檢查項目 1\n- [ ] 檢查項目 2\n\n### 通過編碼\nPREFLIGHT_PASS — 全部檢查通過"
    },
    "1": {
      "title": "Step 1: ...",
      "expected_result": "STEP1_DONE",
      "next_on_pass": "請讀取 steps/step_2.md 開始下一步。",
      "help": "..."
    }
  }
}
```

然後從 plan-as-skill 目錄複製 `chk` 二進位檔到 plan-skill 目錄。

### 步驟 8：測試

用 pi CLI 開一個新 session 載入新建的 plan-skill，問以下問題確認 agent 理解：

```
1. 你的任務是什麼？
2. 總共有幾個 step？編號是什麼？
3. Step 0 要做什麼？
4. 驗收標準是什麼？
5. 每個步驟結束後要做什麼？（先更新 log，再執行 chk）
6. 如果 chk 回傳 FAIL，你該怎麼做？
7. 通過 chk 後，chk 會顯示什麼？
8. 如果需要使用 subagent，subagent 的 prompt 中必須包含什麼？
9. 遠端指令應該怎麼執行？（用 ssh 前綴，不是先連過去）
```

如果 agent 理解正確，plan-skill 就完成了。

---

## 如何執行一個 Plan-Skill

當你載入一個 plan-skill 時，你的任務是執行它。以下是執行指引：

### 1. 讀取 SKILL.md

先完整讀取 SKILL.md，了解全貌：
- Scope 是什麼？
- 總共有幾個階段？
- 驗收標準是什麼？
- 有哪些應變方案？

### 2. 執行 Phase 0: 行前檢查

這是**最重要的一步**。不要跳過。

#### 檢查項目

**a. 環境變數確認**
- `PI_MODEL_DEFAULT`、`PI_MODEL_FALLBACK_HIGH`、`PI_MODEL_FALLBACK_BULK` 是否已設定？
- `PI_PACKAGES_DIR` 是否有指向你的 pi packages 目錄？
- 任何 plan-skill 特定的 env（如 `RDNA_DEV_HOST`）是否已設定？

**b. New Commits 檢查**
- 找出 plan-skill 的 `plan-date`（metadata 中）
- 針對每個相關的 repo，檢查從 `plan-date` 到現在是否有 new commits：
  ```bash
  git log --since=<plan-date> --oneline
  ```
- 如果有重大變更（如 bug fix、新功能），評估是否需要調整計畫
- 如果只是 minor 變更，記錄下來但不需要調整

**c. 決策點**
- 全部通過 → 進入 Phase 1
- 有重大變更 → 評估是否需要調整計畫，必要時問 USER
- 環境變數未設定 → 停止，請 USER 設定

### 3. 依序執行各步驟，透過 herdr 實際分工

每個步驟使用 progressive disclosure：
- 先讀 `chapters/phase-<N>-<name>.md` 取得詳細說明
- 如果步驟需要 subagent，**一定要透過 herdr 實際分工**，不要自己一個人做
- 確保 delegated agent 獲得需要的工具（`-t`）、pi packages（`-e`）、上下文（`prompt`）
- **subagent 的 prompt 中必須包含「先 SSH 到遠端主機」的指令**，否則 subagent 會在本地執行
- 達到驗收標準後執行 `chk --step <N> --result <CODE>`，通過後才能進入下一步

### 4. 持續寫 Log + 執行 chk（強制閘門）

每個步驟結束時，**先更新 log，再執行 chk**：

```bash
# 1. 更新 notes/execution-log.md
# 2. 執行 checkpoint 驗證
./chk --step <N> --result <CODE>

# 如果回傳 PASS ✅ → 進入下一步
# 如果回傳 FAIL ❌ → 修正問題，重新執行 chk 直到 PASS
```

Log 記錄在 `notes/execution-log.md`，每個步驟的內容：
- 做了什麼、用了什麼指令、結果如何
- 做了什麼決策
- 遇到什麼問題、如何解決

### 5. 處理 Loop 與重試

- 如果某個步驟未通過驗收，送回重試
- 重試次數上限：`PI_PLAN_MAX_RETRY`（預設 3，從 env 讀取）
- 每次重試前必須記錄失敗原因到 log，且調整策略（不只用同樣方法再試一次）
- 超過上限 → escalate 給 USER

### 6. 寫 Notes

執行完成後，寫下經驗回饋到 `notes/` 目錄。
這與 log 不同：log 是過程記錄，notes 是事後總結與建議，供下次迭代參考。

---

```
skills/<plan-name>/
├── SKILL.md              ← 入口：只揭露 Step 0（L0）
├── steps/                ← 各步驟詳細內容（L1，progressive disclosure）
│   ├── step_1.md
│   ├── step_2.md
│   ├── step_2a.md
│   ├── step_2b.md
│   └── ...
├── chk.json              ← 各步驟的 checkpoint 驗收定義（含 next_on_pass）
├── chk                   ← Go 編譯的 CLI 二進位檔（從 plan-as-skill 複製）
├── .chkstate.json        ← 執行狀態（自動產生，gitignored）
├── chapters/             ← 輔助章節（選擇性）
├── indexes/              ← 輔助索引
│   └── contingency.md    ← 已知陷阱與應變方案
└── notes/                ← 執行後的經驗回饋
```

每個步驟的 `expected_result` 是字串編碼，agent 必須在完成步驟後用 `chk --step <N> --result <CODE>` 宣告。

編碼慣例：
- 行前檢查通過 → `PREFLIGHT_PASS`
- 一般步驟完成 → `STEP<N>_DONE`（如 `STEP1_DONE`）
- 分支步驟完成 → `BRANCH_<NAME>_DONE`（如 `BRANCH_A_DONE`）
- 驗收通過 → `ACCEPTANCE_PASS`
- 收尾完成 → `WRAPUP_DONE`

每個 `help` 欄位必須包含：
1. 該步驟的驗收清單（`- [ ]` 格式）
2. 通過編碼的說明

## 與 herdr-with-pi 的關係

Plan-as-Skill 是 herdr-with-pi 的**進階執行模式**：

| 層次 | 工具 | 角色 |
|------|------|------|
| **執行層** | `herdr_layout` / `herdr_pane` / `herdr_agent` | 開 pane、啟動 agent、派任務 |
| **策略層** | `herdr-with-pi` skill | 何時用 subagent、怎麼分工、worktree 規則 |
| **計畫層** | `plan-as-skill` (本 skill) | 如何把計畫變成 skill、如何執行 plan-skill |
| **執行層** | 具體的 plan-skill（如 `r9700-qwen3.8-sglang`） | 可執行的計畫本身 |

---

## 可用的 Pi Packages 資源

執行 plan-skill 時，需要的 pi packages 從 `PI_PACKAGES_DIR` 指定的路徑動態發現：

```bash
# 查看所有可用的 packages
herdr_package list

# 解析需要的 package 的路徑，然後傳給 subagent
herdr_package resolve ["<package-name>"]
# → -e /path/to/package
```

每個 plan-skill 的 `chapters/` 或 `SKILL.md` 中會標註建議使用的 packages。

---

## 模板與範例（for Agent 使用）

當你（agent）被要求建立一個新的 plan-skill 時，以下資源可參考：

| 資源 | 位置 | 說明 |
|------|------|------|
| [通用模板](templates/plan-skill-template/SKILL.md) | `templates/plan-skill-template/` | 建立新 plan-skill 的結構參考 |
| [模板說明](templates/README.md) | `templates/README.md` | 檢查清單與測試方式 |

## 現有的 Plan-Skills

| Plan-Skill | 位置 | 說明 | 規劃日期 |
|-----------|------|------|----------|
| [r9700-qwen3.8-sglang](../../r9700-qwen3.8-sglang/SKILL.md) | `skills/r9700-qwen3.8-sglang/` | 在 R9700 上使用 sglang 跑 Qwen3.8-27B AWQ-INT4 | 2026-08-20 |
| [r9700-qwen38-sglang-phase4](../../r9700-qwen38-sglang-phase4/SKILL.md) | `skills/r9700-qwen38-sglang-phase4/` | WMMA v1 kernel 正確性除錯 → 語義模型建立 → 精確回修 → SGLang 整合 | 2026-08-24 |
| [r9700-qwen38-sglang-phase5](../../r9700-qwen38-sglang-phase5/SKILL.md) | `skills/r9700-qwen38-sglang-phase5/` | 端到端效能優化：CUDA Graph → context 擴展 → GDN backend | 2026-08-25 |