# Chapter 3: 驗收 Endpoint 設計

## Core Idea

就像 API endpoint 是微服務的合約邊界，plan-skill 中的驗收 endpoint 是**階段完成的合約邊界**。定義清楚「什麼叫完成」，才能避免 agent 自以為做完但 USER 不滿意。

## 雙層驗收

每個階段應該定義兩類驗收 endpoint：

### Validation Endpoint — 滿足 USER 目標

**問**：這個階段做完，USER 的目標有被滿足嗎？

**特性**：
- 從 USER 的視角來定義
- 成功與否是「任務層級」的判斷
- 不受技術方案選擇影響

**範例**：
- 「Qwen3.8-27B 可以在 R9700 上正確產出推理結果」
- 「轉換後的 skill 可以被 pi 正確載入並回答問題」
- 「檢索式找到的論文數量適中（500~2000 篇）且關鍵字合理」

### Verification Endpoint — 技術方案達標

**問**：我們選擇的技術方案有達到預期效果嗎？

**特性**：
- 從技術實作的視角來定義
- 成功與否是「方案層級」的判斷
- 當技術方案選擇多個時，每個方案各自有 verification endpoint

**範例**：
- 「AWQ 路徑有無利用到 iu4 硬體加速？throughput 是否符合 roofline 預期？」
- 「AITER arch 表修復後，FP8 kernel 是否真的在用 WMMA 指令？」
- 「重建的 container 是否包含 gfx1201 kernel？」

### 兩者的關係

```
Validation: 我可以開車到台北嗎？
Verification: 我的引擎有沒有發揮 100% 馬力？

Validation 通過但 Verification 未通過 → 可用但慢，可接受但不理想
Validation 未通過但 Verification 通過 → 技術方案正確但走錯方向
兩者都通過 → 理想狀態
```

---

## 驗收標準的撰寫原則

### 1. 可客觀判斷

**避免**：「模型跑起來感覺不錯」
**改為**：「模型回應符合預期格式，包含正確的 tool call 結構」

### 2. 有具體數值

**避免**：「速度夠快」
**改為**：「decode throughput ≥ 20 tok/s」

### 3. 有通過條件

**避免**：「檢查輸出」
**改為**：「使用 reviewer subagent 檢查輸出，輸出格式與預期一致才算通過」

### 4. 有失敗處理

每個驗收 endpoint 應定義：
- 通過 → 下一步是什麼
- 未通過 → 送回重工（最多 N 次）還是 escalate 給 USER
- 重試間是否要調整策略（還是用同樣方法再試一次）

---

## 驗收的執行方式

### 自動驗收（由 Reviewer Subagent 執行）

Reviewer 是獨立 agent，只負責驗收：
- Reviewer 讀取 Worker 的輸出
- 根據驗收標準逐一檢查
- 回報 pass/fail 清單
- 不修改任何檔案

### 手動驗收（由 USER 確認）

某些決策點需要 USER 介入：
- 涉及資源消耗較大的決策（例：需要花大量 token 重工）
- 涉及主觀判斷（例：輸出品質 USER 才能判斷）
- 涉及策略轉向（例：需要換技術方案）

---

## 範例：R9700 Qwen3.8-27B 的驗收定義

### Validation Endpoint
- Qwen3.8-27B 可以在 R9700 上正確載入並產出推理結果
- 回應格式正確（包含 tool call 結構，如需）
- 平均值 ≤ 30 秒的 TTFT

### Verification Endpoint
- AWQ-INT4 路徑確實使用 Triton dequant kernel（不是 dequant → FP32 慢路徑）
- 在不使用多卡（TP=1）的條件下，decode throughput ≥ 20 tok/s
- 正確性：與 BF16 baseline 對照，MMLU 或同等級 benchmark 分數差異 ≤ 1%

## Key Takeaways

1. Validation = 滿足 USER 目標；Verification = 技術方案達標
2. 兩者都要定義，缺一不可
3. 驗收標準要客觀、可量化、有通過條件
4. Reviewer 獨立執行驗收，不與 Worker 共用
5. 驗收失敗要有明確的處理流程（重試 / escalate）