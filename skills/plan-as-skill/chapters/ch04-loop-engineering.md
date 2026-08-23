# Chapter 4: Loop Engineering 與重試策略

## Core Idea

Loop engineering 的核心是：**設計循環，而不只是設計 prompt。** 一個複雜任務不會一步到位，需要多輪觀察、判斷、行動、確認的循環。Plan-skill 的每個階段都是一個 loop。

## OODA Loop

```
Observe  →  檢查當前狀態、讀取中間結果
  ↓
Orient   →  分析是否符合預期、判斷下一步
  ↓
Decide   →  選擇行動方案、決定是否重試
  ↓
Act      →  執行工具、呼叫 subagent、問 USER
  ↓
Observe  →  檢查結果，決定進入下一階段或重試
```

### 範例：大量書籍轉換的 Loop

```
Phase 1: Convert & Extract Loop
  Observe: 列出待轉換的 N 本書籍
  Orient:  確認每本書的格式與是否可轉換
  Decide:  決定轉換策略（anydoc / OCR / pdftotext）
  Act:     啟動 N 個 subagent 各自轉換一本書
  Observe: 等所有 subagent 完成 → 檢查結果

Phase 2: Quality Gate Loop
  Observe: 收集所有 subagent 的輸出
  Orient:  逐一檢查品質閘道
  Decide:  通過 → 進入下一階段；未通過 → 重工
  Act:     未通過的送回重工
  Observe: 檢查重工結果 → 全部通過才進入下一階段
```

## 重試策略

### 每次重試應調整策略

不要用同樣方法重試。每次重試前應：
1. 分析前次失敗的原因
2. 調整策略（換工具、換參數、換 model）
3. 記錄調整的理由

### 重試次數上限

- 從 `PI_PLAN_MAX_RETRY` 環境變數讀取（預設 3）
- 在 `~/.profile` 設定：`export PI_PLAN_MAX_RETRY=3`
- 不同階段可以設定不同的上限（機械性任務可設較少，品質關鍵任務可設較多）
- 超過上限後：**escalate 給 USER**

### 階段間轉換

每個階段結束時，必須決定：

1. **進入下一階段** — 目標達成，驗收通過
2. **重試本階段** — 未達標，但值得再試（需在次數上限內）
3. **Escalate 給 USER** — 無法解決、或需要決策、或超過重試上限