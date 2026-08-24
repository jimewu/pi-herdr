---
name: "<your-plan-name>"
description: "<一句話說明這個計畫做什麼>"
metadata:
  plan-date: YYYY-MM-DD
  package: <所屬 package，如 pi-herdr>
  plan-skill: true
  plan-as-skill-version: ">=1.3.0"
---

# Plan: <計畫名稱>

> ⚠️ 這是一個 plan-skill。你的任務是**執行這個計畫**。
> 本 SKILL.md 只揭露 **Step 0** 的內容。後續步驟的詳細內容分別存放在 `step_<N>.md` 檔案中。
> 完成 Step 0 並通過 `chk` 檢查後，`chk` 會告訴你下一步要看哪個檔案。
> 未通過 checkpoint 就不知道下一步做什麼——**無法跳過**。
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

## 執行流程總覽

本計畫使用 `chk` 工具作為**強制閘門**。每個步驟的內容在獨立的 `step_<N>.md` 檔案中，只有通過前一個 checkpoint 才能知道下一步的內容。

```
Step 0 (行前檢查) → 內容在 SKILL.md 中
  → chk --step 0 --result PREFLIGHT_PASS
  → PASS ✅ → chk 告訴你下一步看哪個檔案
  → 讀取 step_*.md → 執行 → chk → ...
```

---

## Step 0: 行前檢查

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

3. **環境變數未設定** → 停止，請 USER 設定

4. **全部通過** → 更新 log 到 `notes/execution-log.md` → 執行 `./chk --step 0 --result PREFLIGHT_PASS`

---

## Subagent 使用規範

> 當步驟需要透過 herdr 啟動 subagent 時，subagent 的 prompt 中必須包含以下規則：

1. **遠端指令以前綴方式執行**：如果任務需要在遠端主機執行指令，每個指令前面加上 `ssh <host>`，例如 `ssh jbackend ls` 而不是先連過去
2. **並非所有指令都需要遠端**：只有那些需要存取遠端資源（如編譯、執行 GPU 程式）的指令才需要加前綴。檔案操作（read/write/edit）仍在本地執行
3. **完成後必須更新 log**：subagent 完成任務後，必須將其執行摘要更新到 plan-skill 的 `notes/execution-log.md`

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