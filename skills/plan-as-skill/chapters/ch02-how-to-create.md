# Chapter 2: 如何建立一個 Plan-Skill

## 步驟 0：確認需要

不是所有任務都需要 plan-skill。只有當任務符合以下特徵時才值得建立：

- **多步驟、長時間**：需要數小時到數天
- **可預先研究**：解法可以事先探索
- **可能重複執行**：同樣的計畫可以重複使用
- **需要多 agent 分工**：可以拆成多個獨立或半獨立子任務

## 步驟 1：研究先行

在寫任何程式碼之前，先完成所有研究。這是最重要的一步。

### 研究方法

```bash
# 搜尋相關資訊
websearch("<關鍵字>")

# 獲取完整頁面內容
webfetch("<url>", raw: true)

# 檢查相關 repo 的 issues / PRs
# 使用 bash + git 或瀏覽 GitHub
```

### 研究需要回答的問題

1. **技術可行性**：這個任務在技術上可行嗎？
2. **已知陷阱**：有哪些 issue / PR 提到了相關問題？
3. **解決方案**：有哪些已知的解決方案？各自優缺點？
4. **資源需求**：需要哪些工具、環境、硬體？
5. **時間估算**：預估需要多少時間？

### 研究的產出

- 已知前提清單（執行時只需確認）
- 已知陷阱與解法
- 多個分支方案（A/B/C）
- 參考資料連結

## 步驟 2：設計 Agent 拓樸

使用 `herdr-with-pi` 的 subagent 概念，設計誰做什麼。

### 問題清單

- 哪些階段可以並行執行？
- 哪些階段需要獨立的 reviewer？
- 哪些階段需要 worktree 模式（git repo 改檔）？
- 哪些階段可以只用小任務模式（orchestrator 自己做）？

### 拓樸範例

```
簡單 pipeline:
  Orch → Phase 1 → Phase 2 → Reviewer → 收尾

有重試的 pipeline:
  Orch → Phase 1 → Reviewer → (pass) → Phase 2
                              → (fail) → Phase 1 loop

扇出扇入（大量獨立子任務）:
  Orch → Phase 1 → Worker A ─→ Reviewer A ─┐
                 → Worker B ─→ Reviewer B ─┼→ Merger → 收尾
                 → Worker C ─→ Reviewer C ─┘
```

## 步驟 3：定義驗收標準

每個階段都要定義驗收標準。使用雙層 endpoint：

### Validation Endpoint（滿足 USER 目標）

從 USER 的視角問：「這個階段做完，USER 的目標有被滿足嗎？」

### Verification Endpoint（技術方案達標）

從技術實作視角問：「我們選擇的技術方案有達到預期效果嗎？」

### 驗收標準撰寫原則

1. **可客觀判斷**：避免「感覺不錯」，改為「回應格式正確，包含 tool call 結構」
2. **有具體數值**：避免「速度夠快」，改為「decode throughput ≥ 20 tok/s」
3. **有通過條件**：避免「檢查輸出」，改為「reviewer 檢查輸出，格式與預期一致才算通過」

## 步驟 4：找出需要的 Pi Packages

從 `PI_PACKAGES_DIR` 指定的路徑動態發現：

```bash
# 查看有哪些 packages 可用
herdr_package list

# 決定任務需要哪些
# 選擇標準：subagent 的任務是否需要該 package 的 skill/tool？

# 解析路徑，傳給 subagent
herdr_package resolve ["<package-name>"]
# → -e /path/to/package
```

## 步驟 5：指定 Model 建議

不指定具體 model 名稱，而是指定**等級**：

| 等級 | 時機 | 引用方式 |
|------|------|----------|
| default | 一般任務 | `PI_MODEL_DEFAULT` |
| high | 品質優先 / 長上下文 | `PI_MODEL_FALLBACK_HIGH` |
| bulk | 大量並行 / 品質普通 | `PI_MODEL_FALLBACK_BULK` |

執行時，orchestrator 會依 env 實際值決定使用哪個 model。

## 步驟 6：寫入 Plan-Skill

按照標準結構寫入 `skills/<plan-name>/` 目錄。

### 命名規則

- 小寫、短橫線分隔
- 一眼能看出計畫內容
- 如 `r9700-qwen3.8-sglang`、`batch-book-to-skill`

### 初始化

```bash
mkdir -p skills/<plan-name>/{chapters,indexes,notes}
```

## 檢查清單

建立完成後，檢查以下項目：

- [ ] SKILL.md 有 `plan-skill: true` 和 `plan-date` 的 metadata
- [ ] 沒有硬編碼具體 model 名稱（改用 `PI_MODEL_*`）
- [ ] 沒有硬編碼具體路徑（改用 env 或相對路徑）
- [ ] 有明確的 Scope 和不包含項目
- [ ] 有研究結論（已知前提與證據來源）
- [ ] 有 Phase 0: 行前檢查
- [ ] 每個階段有決策點
- [ ] 有驗收標準（validation + verification）
- [ ] 有應變方案
- [ ] 有參考資料