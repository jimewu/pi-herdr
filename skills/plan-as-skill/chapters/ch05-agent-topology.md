# Chapter 5: Agent 拓樸與 Multi-Agent 分工

## Core Idea

一個複雜任務的 agent 拓樸就是它的執行圖譜。設計 agent 之間的依賴關係、資料流動、與驗收節點，而不是把所有工作塞給一個 agent。

## 節點類型

| 節點 | 角色 | 特徵 |
|------|------|------|
| **Orchestrator** | 主 agent，載入 plan-skill 並協調全局 | 不直接產出，只負責派發、監督、收尾 |
| **Worker** | 執行具體任務的 subagent | 可並行、可重試、可取代 |
| **Reviewer** | 獨立驗收的 subagent | 唯讀、不修改、與 Worker 不同 agent |
| **Merger** | 合併多個 Worker 的輸出 | 處理衝突、統整格式 |

## 常見拓樸模式

### 模式 1：Pipeline（順序執行）

```
Orch → Phase 1 → Gate → Phase 2 → Gate → Phase 3 → Reviewer
```

**適用**：階段依賴明確，每個階段的前置條件是前一階段的完成

### 模式 2：Pipeline + 重試迴圈

```
Orch → Phase 1 → Reviewer → (pass) → Phase 2
                           → (fail) → Phase 1 (重試)
```

**適用**：需要品質門控的迭代開發

### 模式 3：扇出/扇入（並行執行）

```
         ┌→ Worker 1 ─┐
         │             │
Orch ────┼→ Worker 2 ─┼→ Reviewer → Merger
         │             │
         └→ Worker 3 ─┘
```

**適用**：大量獨立子任務（轉換多本書、同時檢索多個來源）

## 關鍵設計原則

### 1. Reviewer 獨立性

**Reviewer 永遠必須是獨立的 agent**，與執行該階段的 Worker 不能是同一個 agent。這是避免「自己驗收自己工作」的 bias。

實作方式：
- 用不同的 subagent name 啟動
- Reviewer 的 profile 只給 `read, bash` 工具，不給寫入權限
- 如果使用 worktree 模式，Reviewer 開在唯讀的 worktree

### 2. 資源邊界

不同路徑的 agent 應該：
- 有獨立的上下文（不互相干擾）
- 有獨立的工具白名單（只給需要的）
- 有獨立的 model 分配（可依任務輕重指定不同 model / thinking level）

### 3. 失效隔離

一個 Worker 失敗不應影響其他 Worker：
- 每個 Worker 在獨立 pane（或 tab）中執行
- Worker 之間不共享狀態
- 失敗的 Worker 可以被關閉、重啟，不影響其他 Worker