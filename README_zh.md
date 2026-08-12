# pi 用的 herdr skill

[Herdr](https://herdr.dev) 的 agent skill，整理成給
[pi](https://github.com/badlogic/pi) 用的版本。pi 實作
[Agent Skills 標準](https://agentskills.io/specification)。

這個 repo 包含 `SKILL.md`，是
[`herdrdev/herdr`](https://github.com/herdrdev/herdr) 倉庫中
[`skills/herdr/SKILL.md`](https://github.com/herdrdev/herdr/blob/main/skills/herdr/SKILL.md)
（Apache-2.0）的逐字備份。它教 agent 如何在 Herdr 管理的窗格內，透過 `herdr` CLI 控制 Herdr。

## 這個 skill 做什麼

載入後，agent 可以：

- 檢視 workspace、tab、pane 與相鄰的 agent
- 分割窗格、執行指令，且不搶走使用者焦點
- 讀取窗格輸出與最近的 log
- 等待伺服器、測試或另一個 agent 完成
- 在相鄰窗格啟動輔助 agent（支援 `--kind pi`）

## 需求

- 你必須在 **Herdr 內部** 啟動 agent，這樣 `HERDR_ENV=1` 才會被設定（否則這個 skill 會拒絕執行）。
- `herdr` CLI 要在 `PATH` 中。
- 選用：先跑一次 `herdr --skill`，它會輸出與你安裝的 Herdr 版本相符的內建 skill 副本。

## 安裝到 pi

Clone 這個 repo，然後 symlink 到全域 skill 目錄：

```bash
git clone <本倉庫> ~/src/skill-herdr   # 或你習慣的位置
ln -s ~/src/skill-herdr ~/.agents/skills/herdr
```

pi 會從 `~/.agents/skills/` 與 `~/.pi/agent/skills/`（全域）、以及
`.pi/skills/` / `.agents/skills/`（專案內）發現 skill。其他安裝方式：

```bash
# 只給單一專案用
mkdir -p .pi/skills && ln -s ~/src/skill-herdr .pi/skills/herdr

# 或直接用 CLI 指定
pi --skill ~/src/skill-herdr
```

skill 名稱是 `herdr`；當你在 prompt 中提到 Herdr 時，它會按需載入。
也可以強制載入：`/skill:herdr`（需要在 settings 開啟 `enableSkillCommands`）。

## 驗證

```bash
test "${HERDR_ENV:-}" = 1 && echo "inside herdr"
herdr --skill | diff - <(sed -n '5,$p' SKILL.md) && echo "skill matches installed herdr"
```

## 更新

`SKILL.md` 是快照；跟上游同步：

```bash
./scripts/update-skill.sh            # 抓 main
./scripts/update-skill.sh v0.8.0     # 指定 tag
```

或使用官方工具重裝：`npx skills add herdrdev/herdr --skill herdr -g`。

## 授權與出處

`SKILL.md` © herdrdev，Apache-2.0。本 repo 其他內容預設為 MIT。
原始檔請見上游倉庫或執行 `herdr --skill`。
