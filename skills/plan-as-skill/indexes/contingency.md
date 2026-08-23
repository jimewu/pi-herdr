# Contingency Index

## 通用應變方案

### 環境問題

| 狀況 | 應變方案 |
|------|----------|
| `PI_MODEL_DEFAULT` 未設定 | 停止分派，請 USER 設定 |
| `PI_PACKAGES_DIR` 未設定 | 不掛載 pi packages，只用內建 tools |
| `HERDR_ENV != 1` | 停止，plan-as-skill 需要 Herdr 環境 |
| 特定 subagent 啟動失敗 | 重試（最多 3 次），仍失敗則 escalate 給 USER |
| subagent timeout | 檢查是否 hang（用 `herdr_agent read`），必要時 kill 重啟 |
| reviewer 回報不一致 | 啟動第二個 reviewer 做 cross-validation |

### 資源問題

| 狀況 | 應變方案 |
|------|----------|
| Token 消耗超過預估 50% | 暫停，詢問 USER 是否繼續 |
| 某個 model 不可用 | 依 `PI_MODEL_FALLBACK_*` 規則 fallback |
| 超出 context 上限 | 改用 context 更大的 model，或拆解任務 |
| GPU 記憶體不足 | 降低 batch size、改用更小的量化格式、或換 TP 配置 |

### Git 問題

| 狀況 | 應變方案 |
|------|----------|
| worktree 衝突 | 檢查是否有其他 branch 正在使用相同檔案 |
| merge 衝突 | orchestrator 手動解決 |
| review 不通過 | 送回重工（最多 `PI_PLAN_MAX_RETRY` 次），仍不通過則 escalate |

## 特定計畫應變方案

見各 plan-skill 的 `SKILL.md` 或 `indexes/contingency.md`。