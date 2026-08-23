# Chapter 4: 資源規劃與 Token 管理

## Core Idea

每個階段都有不同的資源需求。規劃時預先估算 token 消耗、model 等級、thinking level，可以讓 USER 在執行前知道「這趟要花多少錢」，也讓執行階段的資源分配更有效率。

## 三個維度

### 1. 模型等級

| 等級 | 用途 | 來自 env |
|------|------|----------|
| **default** | 一般任務的預設 model | `PI_MODEL_DEFAULT` |
| **high** | 品質優先 / 需長上下文 | `PI_MODEL_FALLBACK_HIGH` |
| **bulk** | 大量並行、品質要求普通 | `PI_MODEL_FALLBACK_BULK` |

### 2. Thinking Level

| 任務難度 | 建議 level | 範例 |
|----------|-----------|------|
| **mechanical** | off | 檔案轉換、格式檢查、目錄探查 |
| **general** | minimal ~ low | 文獻檢索、中等 code 修改、文件摘要 |
| **complex** | medium ~ high | 跨檔案重構、設計決策、長文分析 |
| **quality-critical** | high | code review、演算法實作、多步驟規劃 |

### 3. Token 消耗估算

每一階段應預估：
- **Input tokens**：需要讀取的檔案大小 + prompt overhead
- **Output tokens**：預期產出的檔案大小
- **Loop 成本**：如果可能重試，預留 buffer

---

## 資源消耗速查表

| 任務類型 | 預估 input | 預估 output | 建議 model | 建議 thinking |
|----------|-----------|------------|-----------|--------------|
| 檔案轉換（1 本書） | 0.5~2K | 1~5K | bulk | off |
| 結構分析（1 本書） | 5~20K | 2~5K | default | low |
| 章節生成（1 章） | 5~10K | 3~8K | default | medium |
| 品質驗證（1 本書） | 3~10K | 1~2K | high | high |
| 文獻檢索（1 輪） | 1~3K | 1~3K | default | low |
| 程式碼審查（1 檔） | 2~10K | 1~3K | high | high |

---

## 執行階段的動態調整

規劃時的建議只是**起點**。實際執行時可依以下條件調整：

### 由 USER 變更
- 當天還有多少額度 → 選擇用 bulk 還是 high
- 時間壓力 → 降低 thinking level 或改用更快的 model
- 品質要求 → 提高 thinking level 或改用 high model

### 由環境決定
- 某個 model 不可用 → 自動 fallback
- 超出 context 上限 → 改用 context 更大的 model

### 由階段結果動態調整
- 前一個階段品質很好 → 可降低下個階段的 thinking level
- 前一個階段踩到陷阱 → 下個階段改用高品質 model 並提高 thinking level

---

## 範例：R9700 Qwen3.8-27B 的資源規劃

| 階段 | 預估 input | 預估 output | 建議 model | 建議 thinking |
|------|-----------|------------|-----------|--------------|
| Phase 0: 行前檢查 | 2~5K | 1~2K | default | off |
| Phase 1: 缺.口確認 | 10~30K | 3~5K | default | low |
| Phase 2: 實作 | 5~20K | 10~50K | high | medium |
| Phase 3: 驗收 | 3~10K | 2~5K | high | high |

## Key Takeaways

1. 規劃時預估資源消耗，但執行時可動態調整
2. 不同階段的資源需求差異很大——不要用同一把尺量所有階段
3. 重試 loop 的成本要預先算進去
4. 資源規劃的主要目的是讓 USER 在執行前知道「這趟要花多少錢」