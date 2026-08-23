# Chapter 6: 驗收 Endpoint 設計

## Core Idea

就像 API endpoint 是微服務的合約邊界，plan-skill 中的驗收 endpoint 是**階段完成的合約邊界**。定義清楚「什麼叫完成」，才能避免 agent 自以為做完但 USER 不滿意。

## 雙層驗收

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

## 驗收標準的撰寫原則

1. **可客觀判斷**：避免「感覺不錯」，改為「回應格式正確，包含 tool call 結構」
2. **有具體數值**：避免「速度夠快」，改為「decode throughput ≥ 20 tok/s」
3. **有通過條件**：避免「檢查輸出」，改為「reviewer 檢查輸出，格式與預期一致才算通過」
4. **有失敗處理**：通過 → 下一步；未通過 → 送回重工（最多 N 次）或 escalate