# Chapter 1: Loop Engineering

## Core Idea

Loop engineering 的核心是：**設計循環，而不只是設計 prompt。** 
一個複雜任務不會一步到位，需要多輪觀察、判斷、行動、確認的循環。

## OODA Loop 應用

每個階段應定義明確的 OODA loop：

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
  Observe: 等所有 subagent 完成

Phase 2: Quality Gate Loop
  Observe: 收集所有 subagent 的輸出
  Orient:  逐一檢查品質閘道（quality-gate.py）
  Decide:  通過 → 進入下一階段；未通過 → 重工
  Act:     未通過的送回重工（最多 N 次）
  Observe: 檢查重工結果

Phase 3: Validation Loop
  Observe: 收集所有通過品質的章節
  Orient:  啟動 reviewer subagent 逐一驗證
  Decide:  通過 → 合併；未通過 → 回 Phase 2
  Act:     合併進 skill repo 或送回重工
```

## Loop 上限

每個 loop 必須有明確的重試上限，避免無限迴圈：

- 預設值：`PI_PLAN_MAX_RETRY=3`（從環境變數讀取）
- 在 `~/.profile` 設定：`export PI_PLAN_MAX_RETRY=3`
- 每個階段可以設定不同的上限（例：機械性任務可設較少，品質關鍵任務可設較多）
- 超過上限後：**escalate 給 USER**，不要繼續重試

## 階段間轉換

每個階段結束時，必須決定：

1. **進入下一階段** — 目標達成，驗收通過
2. **重試本階段** — 未達標，但值得再試（需在次數上限內）
3. **Escalate 給 USER** — 無法解決、或需要決策、或超過重試上限

## Key Takeaways

1. Loop 不是「重複做到對」的無限迴圈，而是有明確退出條件的迭代
2. 每個 loop 要有 Observe 點——不能只看結果，要能檢查中間狀態
3. Loop 上限從 env 拉，不在 code 中硬編碼
4. 不同階段的 loop 特性不同：機械任務 loop 短，品質任務 loop 長