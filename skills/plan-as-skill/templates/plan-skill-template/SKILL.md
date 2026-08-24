---
name: "<your-plan-name>"
description: "<一句話說明這個計畫做什麼>"
metadata:
  plan-date: YYYY-MM-DD
  package: <所屬 package，如 pi-herdr>
  plan-skill: true
  plan-as-skill-version: ">=1.2.0"
---

# Plan: <計畫名稱>

> ⚠️ 這是一個 plan-skill。你的任務是**執行這個計畫**。
> 先完整閱讀本 SKILL.md 了解全貌，然後從 **Step 0** 開始逐步執行。
> 每個步驟都有編號與對應的 `chk` checkpoint。**未通過 checkpoint 不得進入下一步。**
> 執行過程中必須持續寫 log 到 `notes/execution-log.md`，每個步驟結束時、執行 `chk` 之前追加。

---

## Scope

<!-- 明確的範圍與目標 -->

**包含**：
- 項目 1
- 項目 2

**不包含**：
- 項目 1
- 項目 2

---

## 研究結論（已預先完成）

<!-- 規劃時已經完成的研究，列出所有已知前提與證據來源。執行時只需確認前提仍成立。 -->

| 前提 | 證據來源 | 執行時需確認 |
|------|----------|-------------|
| 前提 1 | 參考連結或文件 | ✅ 如何確認 |
| 前提 2 | 參考連結或文件 | ✅ 如何確認 |

---

## 需要的資源

### 環境變數

| 變數 | 用途 | 說明 |
|------|------|------|
| `PI_MODEL_DEFAULT` | 一般任務的 model | 執行時依 env 實際值 |
| `PI_MODEL_FALLBACK_HIGH` | 品質優先任務的 model | 執行時依 env 實際值 |
| `PI_PLAN_MAX_RETRY` | 重試次數上限（預設 3） | 執行時依 env 實際值 |
| `<其他特定變數>` | <用途> | <說明> |

### Pi Packages

<!-- 執行時從 PI_PACKAGES_DIR 動態發現。列出建議使用的 packages。 -->

- **<package-name>** — <用途說明>

---

## 執行步驟

> ⚠️ **重要規則**：
> 1. 每個步驟執行完畢後，必須先更新 `notes/execution-log.md`，再執行 `chk --step <N> --result <CODE>`
> 2. 如果 `chk` 回傳 FAIL，根據錯誤訊息修改後，重新執行 `chk` 直到 PASS
> 3. 未通過 checkpoint 不得進入下一步
> 4. 如果需要使用 subagent，subagent 的 prompt 中必須包含「先 SSH 到遠端主機」的指令
> 5. 每次重試前必須記錄失敗原因到 log，且調整策略（不只用同樣方法再試一次）

### Step 0: 行前檢查

**編號**: `0`
**預估**: input ~X-Y K / output ~X-Y K
**model**: `PI_MODEL_DEFAULT` / **thinking**: off

**決策點：全部通過才能 proceed。**

1. **環境確認**
   - [ ] 執行 `echo $<需要的環境變數>` 確認已設定
   - [ ] <其他環境檢查>

2. **New Commits 檢查**（檢查 `plan-date=<plan-date>` 到現在的 commits）
   - [ ] <repo 1>：`git log --since=<plan-date> --oneline` — 檢查是否有影響本計畫的變更
   - [ ] <repo 2>：同上

3. **決策點**
   - 全部通過 → 更新 log → 執行 `chk --step 0 --result PREFLIGHT_PASS`
   - 有重大變更 → 評估是否需要調整計畫，必要時問 USER
   - 環境變數未設定 → 停止，請 USER 設定

---

### Step 1: <階段名稱>

**編號**: `1`
**預估**: input ~X-Y K / output ~X-Y K
**model**: `PI_MODEL_*` / **thinking**: <level>

**步驟**：

1. 步驟 1
2. 步驟 2
3. ...

**完成條件**: 目標達成後，更新 log → 執行 `chk --step 1 --result STEP1_DONE`

---

### Step 2: <階段名稱>

**編號**: `2`
**預估**: input ~X-Y K / output ~X-Y K
**model**: `PI_MODEL_*` / **thinking**: <level>

如果有多個分支，用以下格式：

**分支 2a**: <情況說明>
```
1. 步驟 1
2. 步驟 2
```
**完成條件**: 更新 log → 執行 `chk --step 2a --result BRANCH_A_DONE`

**分支 2b**: <情況說明>
```
1. 步驟 1
2. 步驟 2
```
**完成條件**: 更新 log → 執行 `chk --step 2b --result BRANCH_B_DONE`

**主步驟完成條件**: 所有分支完成後，更新 log → 執行 `chk --step 2 --result STEP2_DONE`

---

### Step 3: 驗收

**編號**: `3`
**預估**: input ~X-Y K / output ~X-Y K
**model**: `PI_MODEL_FALLBACK_HIGH` / **thinking**: high
**由獨立 reviewer subagent 執行**（subagent 必須先 SSH 到遠端主機）

#### Validation Endpoint（滿足 USER 目標）

| 標準 | 檢查方式 | 通過條件 |
|------|----------|----------|
| 標準 1 | 檢查方式 | 通過條件 |
| 標準 2 | 檢查方式 | 通過條件 |

#### Verification Endpoint（技術方案達標）

| 標準 | 檢查方式 | 通過條件 |
|------|----------|----------|
| 標準 1 | 檢查方式 | 通過條件 |
| 標準 2 | 檢查方式 | 通過條件 |

#### 重試規則
- 未通過 → 送回前一階段重工（最多 `PI_PLAN_MAX_RETRY` 次）
- 超過上限 → escalate 給 USER

**完成條件**: 所有驗收通過後，更新 log → 執行 `chk --step 3 --result ACCEPTANCE_PASS`

---

### Step 4: 收尾

**編號**: `4`
**預估**: input ~X-Y K / output ~X-Y K
**model**: `PI_MODEL_DEFAULT` / **thinking**: off

1. 記錄 benchmark 數據（如有）
2. 寫 Log 與 Notes
3. 清理：如果使用 worktree 模式，關 pane + 刪 worktree + 刪 branch
4. 報告 USER 執行結果
5. 執行 `chk --step 4 --result WRAPUP_DONE`

---

## `chk` 驗收檢查工具

本 plan-skill 目錄下有 `chk.json` 和 `chk` 二進位檔，定義了每個步驟的 checkpoint 驗收標準。

### 使用方法

```bash
# 查看某步驟的驗收標準
./chk --step <N> --help

# 驗證並記錄某步驟通過（必須先更新 log）
./chk --step <N> --result <CODE>

# 查看所有步驟的當前狀態
./chk --list

# 重置所有狀態（開始新執行）
./chk --reset
```

### 執行流程示意

```
┌─────────────────────────────────────────────────┐
│  執行 Step N                                     │
│  → 完成所有子任務                                │
│  → 更新 notes/execution-log.md                  │
│  → chk --step N --result <CODE>                 │
│    ├── PASS ✅ → 進入 Step N+1                  │
│    └── FAIL ❌ → 修正問題 → 重新執行 chk        │
└─────────────────────────────────────────────────┘
```

---

## Agent 拓樸

<!-- 用 ASCII art 畫出 agent 之間的關係 -->

```
Orchestrator (plan runner)
  │
  ├── Step 0: 行前檢查 (orchestrator 親自執行) → chk
  ├── Step 1: <名稱> (orchestrator 親自執行 / 或 subagent)
  │     └── (失敗) ──→ Step 1 (重試, 最多 PI_PLAN_MAX_RETRY 次)
  ├── Step 2: <名稱> (subagent, 須先 SSH 到遠端主機)
  │     ├── 2a: <分支 A> → chk
  │     ├── 2b: <分支 B> → chk
  │     └── (失敗) ──→ Step 2 (重試)
  ├── Step 3: 驗收 (獨立 reviewer subagent, 唯讀, 須先 SSH)
  │     ├── (pass) → chk → Step 4
  │     └── (fail) ──→ Step 2 (重試)
  └── Step 4: 收尾 (orchestrator 親自執行) → chk
```

---

## Subagent 使用規範

> ⚠️ 任何 subagent 的 prompt 中，**必須包含以下規則**：
> 1. 先 SSH 到遠端主機：`ssh ${RDNA_DEV_HOST%:*}`
> 2. 所有 bash 命令都在 SSH 連線後執行
> 3. 檔案操作（read/write/edit）仍在本地執行
> 4. 完成後必須更新 log 到指定路徑

---

## 應變方案

| 狀況 | 應變方案 |
|------|----------|
| 狀況 1 | 解法 1 |
| 狀況 2 | 解法 2 |

---

## 執行後 Notes

（執行後填寫，包含 `notes/execution-log.md` 的過程記錄和 `notes/` 的事後總結）

---

## 參考資料

- [連結 1](url)
- [連結 2](url)