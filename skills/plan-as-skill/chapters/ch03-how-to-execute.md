# Chapter 3: 如何執行一個 Plan-Skill

## 載入階段

當你（agent）被載入一個 plan-skill 時，你的任務是**執行它**。

### 第一步：讀取 SKILL.md

先完整讀取 SKILL.md，了解全貌：

1. Scope 是什麼？什麼是 included / excluded？
2. 總共有幾個階段？
3. 驗收標準是什麼？
4. 有哪些應變方案？
5. 需要哪些環境變數和 pi packages？

### 第二步：確認資源

```bash
# 確認環境變數
echo $PI_MODEL_DEFAULT
echo $PI_MODEL_FALLBACK_HIGH
echo $PI_PACKAGES_DIR
echo $PI_PLAN_MAX_RETRY

# 確認需要的 pi packages 可用
herdr_package list
```

如果需要的環境變數未設定，**停止執行**並請 USER 設定。

## 執行 Phase 0: 行前檢查

這是**最重要的一步**。不要跳過。

### 檢查項目

**1. 環境變數確認**
- `PI_MODEL_DEFAULT`、`PI_MODEL_FALLBACK_HIGH`、`PI_MODEL_FALLBACK_BULK` 是否已設定？
- 任何 plan-skill 特定的 env 是否已設定？

**2. New Commits 檢查**
- 找出 plan-skill 的 `plan-date`（metadata 中）
- 針對每個相關的 repo，檢查從 `plan-date` 到現在是否有 new commits

```bash
# 範例
git log --since=2026-08-20 --oneline -- <相關路徑>
```

- 判斷變更的影響程度：
  - **重大變更**：bug fix、新功能、API 變更 → 需要調整計畫，必要時問 USER
  - **minor 變更**：文件更新、重構 → 記錄即可，不需調整

**3. 決策點**
- 全部通過 → 進入 Phase 1
- 有重大變更 → 評估是否需要調整計畫
- 環境變數未設定 → 停止，請 USER 設定

## 執行各階段

### 每階段的流程

```
1. 讀取 chapters/phase-<N>.md（如果需要的話）
2. 執行該階段的步驟
3. 到決策點時，判斷：
   a. 目標達成 → 進入下一階段
   b. 未達標但可重試 → 重試（檢查次數上限）
   c. 無法解決 → escalate 給 USER
```

### 使用 Progressive Disclosure

- 不要一次讀取所有 chapters/ 檔案
- 只在需要時讀取當前階段的詳細說明
- 應變方案只在遇到對應狀況時才查

### 使用 Subagent 分工

當計畫指定使用 subagent 時，**一定要透過 herdr 實際分工**，不要自己一個人做所有事。

分工的具體做法（herdr-with-pi skill 已有完整說明，此處只列要點）：

1. **確保 delegated agent 獲得需要的工具和上下文**：
   - 使用 `-t <tools>` 指定工具白名單（只給它需要的，不要給太多）
   - 如果任務需要某個 pi package 的 skill/tool，使用 `herdr_package list` 查看可用 package，然後 `herdr_package resolve` 取得路徑，用 `-e <dir>` 傳給 subagent
   - 任務的 context、身份、output contract 透過 `herdr_agent prompt` 傳遞，不要塞進 agentArgs
   - 如果需要 git 改檔，開 worktree 並把 cwd 指向 worktree

2. **Reviewer 永遠是獨立 agent**：不可與執行該階段的 Worker 共用同一個 agent。

3. **完工即關閉**：subagent 任務完成後，立即 `herdr_pane close` 回收資源。

## 處理 Loop 與重試

### 重試規則

- 每個 loop 的重試次數上限由 `PI_PLAN_MAX_RETRY` 決定（預設 3）
- 每次重試前應記錄失敗原因
- 如果連續失敗，應考慮調整策略（不只是用同樣方法再試一次）

### 超過上限

超過上限後，**不要繼續重試**。改為：
1. 記錄所有嘗試過的方案與結果
2. escalate 給 USER
3. 提供可行的下一步建議

## 寫 Log 與 Notes

### 寫 Log（執行過程記錄）

執行過程中**持續寫 log**，不是只留最後的 notes。Log 的目的是將來 troubleshooting 有依據。

```markdown
# Log - YYYY-MM-DD HH:MM

## Phase X: <階段名稱>

### 執行動作
- 做了什麼：
- 指令/工具呼叫：
- 結果：

### 決策記錄
- 決策：
- 理由：
- 是誰決定的（orchestrator / subagent / USER）：

### 遇到的問題
- 問題描述：
- 解法：
- 解決了嗎：是 / 否（原因）
```

Log 寫在 `notes/execution-log.md`。每個階段結束時追加記錄，不要等全部做完才寫。

### 寫 Notes（事後總結）

執行完成後，寫下經驗回饋到 `notes/` 目錄。這與 log 不同：log 是過程記錄，notes 是事後總結與建議，供下次迭代參考。

```markdown
# Notes - YYYY-MM-DD

## 執行摘要
- 執行日期：
- 使用的 model：
- 總耗時：
- 總 token 消耗：

## 遇到的問題
- 問題 1：... 解法：...
- 問題 2：... 解法：...

## 給下次的建議
- 建議 1
- 建議 2

## 是否需要更新 Plan-Skill？
- [ ] 是（哪些部分需要更新？）
- [ ] 否
```