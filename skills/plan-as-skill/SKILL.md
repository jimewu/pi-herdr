---
name: plan-as-skill
description: "將複雜多步驟任務的執行計畫編碼為可重複使用的 agent skill。計畫預先經過完整研究（探索、檢索、驗證），執行階段只需檢查期間的 new commits。支援 multi-agent 分工、loop engineering、graph engineering、雙層驗收 endpoint（validation / verification）、以及資源感知的 model 建議。執行前有行前檢查，避免空跑。"
metadata:
  version: 1.0.0
  mode: reference
  package: pi-herdr
  depends: herdr-with-pi
---

# Plan-as-Skill

Plan-as-Skill 不是一個「把計畫變成 skill」的轉換器，而是一套**將執行計畫本身編碼為 skill** 的框架。計畫就是 skill，skill 就是計畫。

## 核心哲學

### 計畫與執行分離

```
[規劃階段]                                    [執行階段]
  1. 確定 scope 與目標                        1. 載入 plan-skill（輕量 L0）
  2. 完整研究所有路徑缺口                      2. 行前檢查（狀態確認）
  3. 設計 agent 拓樸與分工                    3. 檢查期間的 new commits
  4. 預先探索解法與陷阱                        4. 依計畫逐步執行（progressive disclosure）
  5. 估算 token 成本與時間                    5. 遇狀況 → 查 contingency
  6. 跟 USER 討論、revise                    6. 寫 notes 回饋
  7. 定型 → 寫成 plan-skill
```

**關鍵原則**：所有探索、研究、檢索、解法驗證，都在規劃階段完成。執行階段只需要：
- 檢查「規劃完成後到執行當下」之間相關 repo 的 new commits
- 確認環境狀態與規劃時一致
- 然後照計畫走

### Progressive Disclosure 套用到計畫

```
L0  SKILL.md                    — 計畫一頁總覽（scope、階段、決策點、預估成本）
L1  chapters/                   — 各階段詳細說明（loop 設計、agent 拓樸、模型建議）
L2  plans/<plan-name>.md        — 具體計畫（可執行的步驟、指令、驗收標準）
    indexes/contingency.md      — 已知陷阱與應變方案索引
    notes/                      — 執行後的經驗回饋
```

### Loop Engineering

每個階段定義明確的 OODA loop：

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

### Graph Engineering — Agent 拓樸

計畫可預先定義 multi-agent 分工拓樸：

```
                 ┌──────────────┐
                 │  Orchestrator │  ← 執行 plan-skill 的主 agent
                 │ (plan runner) │
                 └──────┬───────┘
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Worker A │  │ Worker B │  │ Worker C │  ← 並行工作者
    │ (phase1) │  │ (phase1) │  │ (phase2) │
    └────┬─────┘  └────┬─────┘  └────┬─────┘
         │              │              │
         └──────┬───────┘              │
                ▼                      │
         ┌──────────┐                  │
         │ Reviewer │  ← 獨立驗收      │
         └────┬─────┘                  │
              │ (pass/fail)            │
              ▼                        ▼
         ┌──────────┐           ┌──────────┐
         │ Merger   │           │ ...      │  ← 下一階段
         └──────────┘
```

**核心規則**：Reviewer 永遠是獨立 agent，不能自己驗收自己的工作。

---

## Plan 結構

每個 plan 放在 `plans/<plan-name>.md`，遵循以下模板：

```markdown
# Plan: <計畫名稱>

## Scope
<!-- 明確的範圍與目標 -->

## 已知前提（規劃時已確認）
- [前提 1] — 證據來源
- [前提 2] — 證據來源

## 執行階段

### Phase 0: 行前檢查
<!-- 確認環境狀態、檢查期間的 new commits -->
- 檢查事項清單
- **決策點**: 全部通過才 proceed

### Phase 1: <階段名稱>
<!-- 詳細步驟 -->
- 預估 token 消耗：
- 建議 model：
- 建議 thinking level：
- 步驟 ...

### Phase 2: <階段名稱>
...
<!-- 每一階段可包含子 loop -->

## 驗收 Endpoint

### Validation Endpoint — 直接滿足 USER 目標的標準
- 標準 1
- 標準 2

### Verification Endpoint — 技術方案達標的標準
- 標準 1
- 標準 2

## Contingency Index
- 狀況 A → 解法 A
- 狀況 B → 解法 B

## 執行後 Notes
- （執行後填寫）
```

---

## 執行規則

1. **行前檢查**：每次執行前，先確認所有前提仍成立
2. **New Commits 檢查**：檢查 `plan 建立日` 到 `執行當日` 之間相關 repo 的 commit，若有重大變更需調整計畫
3. **Loop 上限**：每個 loop 的重試次數上限由 `PI_PLAN_MAX_RETRY` 環境變數決定（預設 3，在 `~/.profile` 設定）
4. **Reviewer 獨立**：同一階段的執行與驗收必須由不同 agent 負責
5. **Notes 回饋**：執行後必須寫 notes，供下次迭代參考

## 模型建議規則

- 執行階段可以根據規劃時的建議選擇 model，但實際執行時可依 USER 要求變更
- 規劃時會標註每個階段的建議 model 級別（default / high / bulk）
- 執行時依 `PI_MODEL_DEFAULT` / `PI_MODEL_FALLBACK_HIGH` / `PI_MODEL_FALLBACK_BULK` 實際值決定

## 與 herdr-with-pi 的關係

Plan-as-skill 是 herdr-with-pi 的**進階執行模式**：
- herdr-with-pi 提供 subagent 分派的基礎建設（tools）
- plan-as-skill 提供 **預先規劃好的、經過研究的執行藍圖**（策略）
- 執行時，orchestrator 載入 plan-skill，依照藍圖逐步執行

## Available Plans

| Plan | 說明 | 規劃日期 |
|------|------|----------|
| [r9700-qwen3.8-sglang](plans/r9700-qwen3.8-sglang.md) | 在 R9700 (gfx1201) 上使用 sglang 跑 Qwen3.8-27B AWQ-INT4 | 2026-08-20 |