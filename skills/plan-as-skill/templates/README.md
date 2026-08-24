# Plan-Skill 模板（for Agent 使用）

當你（agent）被要求建立一個新的 plan-skill 時，此目錄提供參考結構。

## 使用方式

1. 讀取 `plan-skill-template/SKILL.md` 了解一個 plan-skill 應該有哪些區塊
2. 根據你的研究結論，填入對應的內容到 `skills/<new-plan-name>/SKILL.md`
3. 如有需要，建立 `chapters/`、`indexes/`、`notes/` 子目錄

## 模板列表

| 模板 | 說明 |
|------|------|
| [plan-skill-template](plan-skill-template/SKILL.md) | 通用 plan-skill 模板，包含所有必要區塊的 placeholder |

## 建立 Plan-Skill 的檢查清單

建立完成後，確認以下項目：

### 結構
- [ ] `skills/<plan-name>/` 目錄已建立
- [ ] `skills/<plan-name>/SKILL.md` 存在（入口）
- [ ] `skills/<plan-name>/chk.json` 存在（checkpoint 定義）
- [ ] `skills/<plan-name>/chk` 存在（二進位檔，從 plan-as-skill 複製）
- [ ] `skills/<plan-name>/chapters/` 目錄存在（選擇性：階段細節）
- [ ] `skills/<plan-name>/indexes/` 目錄存在（選擇性：輔助索引）
- [ ] `skills/<plan-name>/notes/` 目錄存在（執行後記錄）

### SKILL.md 內容
- [ ] YAML frontmatter 有 `plan-skill: true` 和 `plan-date`
- [ ] 開頭有 `⚠️ 這是一個 plan-skill` 的警告
- [ ] Scope 清楚定義 included 和 excluded
- [ ] 研究結論區塊（已預先完成的發現）
- [ ] 需要的資源（環境變數、pi packages）
- [ ] Step 0: 行前檢查（含 new commits 檢查）
- [ ] 每個步驟有編號（0, 1, 2, 2a, 2b, ...）
- [ ] 每個步驟有 model 建議（使用 `PI_MODEL_*`，不硬編碼具體 model）
- [ ] 每個步驟結束點有 `chk --step <N> --result <CODE>` 閘門
- [ ] 每個步驟有「更新 log → 執行 chk」的明確指示
- [ ] Subagent 使用規範（須先 SSH 到遠端主機）
- [ ] 驗收標準（validation + verification）
- [ ] Agent 拓樸（誰做什麼、誰驗收什麼）
- [ ] 應變方案
- [ ] 執行後 Notes 區塊
- [ ] 參考資料

### chk.json 檢查
- [ ] 每個步驟都有對應的 entry
- [ ] 每個 entry 有 `title`、`expected_result`、`help`
- [ ] `help` 包含 `- [ ]` 格式的驗收清單和通過編碼說明
- [ ] 編碼慣例一致（PREFLIGHT_PASS、STEP<N>_DONE、ACCEPTANCE_PASS、WRAPUP_DONE）

### 避免的錯誤
- [ ] 沒有硬編碼具體 model 名稱（改用 `PI_MODEL_*`）
- [ ] 沒有硬編碼具體檔案路徑（改用 env 變數或相對路徑）
- [ ] 沒有把具體計畫內容放在 meta-skill 裡
- [ ] 步驟編號沒有重複或衝突
- [ ] subagent 規範中沒有遺漏 SSH 指令

## 測試方式

建立完成後，用 pi CLI 開一個新 session 載入 plan-skill，問以下問題確認 agent 理解：

```
1. 你的任務是什麼？
2. 總共有幾個 step？編號是什麼？
3. Step 0 要做什麼？
4. 需要哪些環境變數？
5. 驗收標準是什麼？
6. 每個步驟結束後要做什麼？（先更新 log，再執行 chk）
7. 如果 chk 回傳 FAIL，你該怎麼做？
8. 如果 XXX（某個應變方案中的狀況）發生，你該怎麼做？
9. 當計畫指定使用 subagent 時，你該怎麼確保它拿到需要的工具和上下文？
10. Subagent 的 prompt 中必須包含什麼指令？（先 SSH 到遠端主機）
```