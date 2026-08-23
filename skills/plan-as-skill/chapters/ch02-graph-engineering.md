# Chapter 2: Graph Engineering — Agent 拓樸設計

## Core Idea

一個複雜任務的 agent 拓樸就是它的執行圖譜。Graph engineering 是**設計 agent 之間的依賴關係、資料流動、與驗收節點**，而不是把所有工作塞給一個 agent。

## 拓樸元素

### 節點類型

| 節點 | 角色 | 特徵 |
|------|------|------|
| **Orchestrator** | 主 agent，載入 plan-skill 並協調全局 | 不直接產出，只負責派發、監督、收尾 |
| **Worker** | 執行具體任務的 subagent | 可並行、可重試、可取代 |
| **Reviewer** | 獨立驗收的 subagent | 唯讀、不修改、與 Worker 不同 agent |
| **Merger** | 合併多個 Worker 的輸出 | 處理衝突、統整格式 |
| **Gate** | 檢查點，決定是否繼續 | 阻斷失敗路徑，避免浪費 |

### 邊的類型

| 邊 | 語意 | 範例 |
|----|------|------|
| 順序依賴 | B 等 A 完成 | 先轉檔 → 再分析結構 |
| 並行分岔 | 多個 A 同時進行 | 同時轉換多本書 |
| 資料匯流 | 多個 A 餵給一個 B | 多個 Worker 餵給 Reviewer |
| 條件分支 | 結果決定下一站 | 驗收通過→合併；未通過→重工 |
| 回饋迴圈 | 結果回到前一步 | 重工 loop |

## 常見拓樸模式

### 模式 1：扇出/扇入（Fan-out / Fan-in）

```
         ┌→ Worker 1 ─┐
         │             │
Orch ────┼→ Worker 2 ─┼→ Reviewer → Merger
         │             │
         └→ Worker 3 ─┘
```

**適用**：大量獨立子任務（轉換多本書、同時檢索多個來源）

### 模式 2：Pipeline

```
Orch → Phase 1 → Gate → Phase 2 → Gate → Phase 3 → Reviewer
```

**適用**：階段依賴明確（先研究 → 再實作 → 再驗證）

### 模式 3：Pipeline + 迴圈

```
Orch → Phase 1 → Reviewer → (pass) → Phase 2
                           → (fail) → Phase 1 (重試)
```

**適用**：需要品質門控的迭代開發

### 模式 4：混合（Pipeline + 扇出 + 迴圈）

```
Orch ─→ Research ─→ (找到缺口) ─→ Worker A ─→ Reviewer A ─→ (pass) ─→ Merge
                       │             │                       │
                       │         Worker B ─→ Reviewer B ──────┤
                       │                                      │
                       └→ (無缺口) ────────────────────────────┘
```

**適用**：探索性任務（先研究再決定分工）

## 關鍵設計原則

### 1. Reviewer 獨立性

**Reviewer 永遠必須是獨立的 agent**，與執行該階段的 Worker 不能是同一個 agent。這是避免「自己驗收自己工作」的 bias。

實作方式：
- 用不同的 subagent name 啟動
- 如果 worktree 模式，Reviewer 開在唯讀的 worktree 或同一 worktree 但限制唯讀
- Reviewer 的 profile 只給 `read, bash` 工具，不給寫入權限

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

## Key Takeaways

1. 先畫拓樸圖，再寫程式——拓樸決定 agent 分工
2. Reviewer 永遠獨立於 Worker
3. 扇出/扇入是並行任務的標準模式
4. Pipeline 適合階段依賴明確的任務
5. 每個邊都是契約：上游的輸出格式要清楚定義