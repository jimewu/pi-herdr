---
name: "<your-plan-name>"
description: "<一句話說明這個計畫做什麼>"
metadata:
  plan-date: YYYY-MM-DD
  package: <所屬 package，如 pi-herdr>
  plan-skill: true
  plan-as-skill-version: ">=1.1.0"
---

# Plan: <計畫名稱>

> ⚠️ 這是一個 plan-skill。你的任務是**執行這個計畫**。
> 先完整閱讀本 SKILL.md 了解全貌，然後從 Phase 0 開始逐步執行。
> 執行過程中持續寫 log 到 `notes/execution-log.md`，每個階段結束時追加。

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

### Phase 0: 行前檢查

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
   - 全部通過 → 進入 Phase 1
   - 有重大變更 → 評估是否需要調整計畫，必要時問 USER
   - 環境變數未設定 → 停止，請 USER 設定

---

### Phase 1: <階段名稱>

**預估**: input ~X-Y K / output ~X-Y K
**model**: `PI_MODEL_*` / **thinking**: <level>

**步驟**：

1. 步驟 1
2. 步驟 2
3. ...

**決策點**: 目標達成後，進入 Phase 2（或下一個階段）

---

### Phase 2: <階段名稱>

<!-- 如果有多個分支，用以下格式 -->

**分支 A**: <情況說明>
```
1. 步驟 1
2. 步驟 2
```

**分支 B**: <情況說明>
```
1. 步驟 1
2. 步驟 2
```

**決策點**: 基本功能成功後，進入驗收階段

---

### Phase 3: 驗收

**預估**: input ~X-Y K / output ~X-Y K
**model**: `PI_MODEL_FALLBACK_HIGH` / **thinking**: high
**由獨立 reviewer subagent 執行**

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

---

### Phase 4: 收尾

**預估**: input ~X-Y K / output ~X-Y K
**model**: `PI_MODEL_DEFAULT` / **thinking**: off

1. 記錄 benchmark 數據（如有）
2. 寫 Log 與 Notes
3. 清理：如果使用 worktree 模式，關 pane + 刪 worktree + 刪 branch
4. 報告 USER 執行結果

---

## Agent 拓樸

<!-- 用 ASCII art 畫出 agent 之間的關係 -->

```
Orchestrator (plan runner)
  │
  ├── Phase 0: 行前檢查 (orchestrator 親自執行)
  ├── Phase 1: <名稱> (orchestrator 親自執行 / 或 subagent)
  │     └── (失敗) ──→ Phase 1 (重試, 最多 PI_PLAN_MAX_RETRY 次)
  ├── Phase 2: 驗收 (獨立 reviewer subagent, 唯讀)
  │     ├── (pass) ──→ Phase 3
  │     └── (fail) ──→ Phase 1 (重試)
  └── Phase 3: 收尾 (orchestrator 親自執行)
```

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