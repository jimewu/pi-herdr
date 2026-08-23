# Chapter 1: Plan-Skill 的結構與 progressive disclosure

## 什麼是 Plan-Skill？

Plan-skill 是一個**可執行的計畫**，以 Agent-Skills 結構封裝。它與一般 skill 的差別：

| 面向 | 一般 skill（如 book-to-skill） | plan-skill（如 r9700-qwen3.8-sglang） |
|------|-------------------------------|--------------------------------------|
| 目的 | 提供知識參考 | 提供執行指引 |
| 載入後 | agent 查詢知識用 | agent 執行計畫中的步驟 |
| 內容 | 事實、概念、框架 | 步驟、檢查點、驗收標準、分支 |
| 執行方式 | 被動回答問題 | 主動依照階段執行 |

## 目錄結構

```
skills/<plan-name>/
├── SKILL.md              ← 入口：計畫總覽 + 執行指引（L0）
├── chapters/             ← 各階段詳細說明（L1，progressive disclosure）
│   ├── phase-00-pre-flight.md
│   ├── phase-01-xxx.md
│   └── ...
├── indexes/              ← 輔助索引
│   └── contingency.md    ← 已知陷阱與應變方案
└── notes/                ← 執行後的經驗回饋
```

## Progressive Disclosure 的意義

SKILL.md 是**唯一的入口**。當 agent 載入 plan-skill 時，它先讀 SKILL.md 了解全貌。每個階段只需要在需要時才讀對應的 `chapters/phase-<N>.md`。

這讓：
- SKILL.md 保持在 ~4,000 tokens 以內
- 執行階段只載入當前需要的階段細節
- 應變方案只在遇到狀況時才查

## SKILL.md 的主要區塊

每個 plan-skill 的 SKILL.md 應包含以下區塊：

1. **YAML frontmatter** — 標記 `plan-skill: true`，記錄 `plan-date`
2. **⚠️ 警告** — 提醒 agent 這是可執行的計畫，不是參考資料
3. **Scope** — 明確的範圍與不包含項目
4. **研究結論** — 規劃時已完成的發現，避免執行時重複研究
5. **需要的資源** — 環境變數、pi packages、外部工具
6. **執行步驟** — 每個階段的 actions、檢查點、決策點
7. **驗收標準** — validation + verification
8. **Agent 拓樸** — 誰做什麼、誰驗收什麼
9. **應變方案** — 已知問題的解法
10. **參考資料** — 連結與文件

## 常見錯誤

| 錯誤 | 說明 | 正確做法 |
|------|------|----------|
| SKILL.md 太長 | 把所有細節都塞進入口 | 使用 progressive disclosure，細節放 chapters/ |
| 硬編碼具體 model 名稱 | 如 `--model openai/gpt-4` | 改用 `PI_MODEL_*` env 變數 |
| 硬編碼具體路徑 | 如 `/home/user/project/` | 改用 env 變數或相對路徑 |
| 忘記寫決策點 | 階段結束後不知下一步 | 每個階段結尾標明 pass/fail 後的流向 |
| 把具體計畫放在 meta-skill 裡 | 如 `plan-as-skill/plans/` | 具體計畫是獨立 skill，放在 `skills/<plan-name>/` |