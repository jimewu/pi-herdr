# pi 用的 herdr skill

[Herdr](https://herdr.dev) 的 agent skill，整理成給
[pi](https://github.com/badlogic/pi) 用的版本。pi 實作
[Agent Skills 標準](https://agentskills.io/specification)。

這個 repo 包含 `SKILL.md`，是
[`herdrdev/herdr`](https://github.com/herdrdev/herdr) 倉庫中
[`skills/herdr/SKILL.md`](https://github.com/herdrdev/herdr/blob/master/skills/herdr/SKILL.md)
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

注意：herdr 0.7.5 **沒有** `herdr --skill` 這個指令（實測回 `unknown option`，
exit 2），雖然 Herdr 文件（0.8.0）有提到它；內建副本只存在於更新的 binary。
若要對照某個安裝版本的內容，請改以對應的 version tag 下載上游 `SKILL.md`——
見[驗證](#驗證)。

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
curl -fsSL https://raw.githubusercontent.com/herdrdev/herdr/master/skills/herdr/SKILL.md \
  | diff - SKILL.md && echo "SKILL.md matches upstream master"
```

或改對照指定的 tag（例如你打算使用的 skill 版本）：

```bash
curl -fsSL https://raw.githubusercontent.com/herdrdev/herdr/v0.8.0/skills/herdr/SKILL.md \
  | diff - SKILL.md && echo "SKILL.md matches upstream v0.8.0"
```

這裡直接 diff 整個檔案，不依賴 frontmatter 的行數。注意：上游預設分支是
`master`，不是 `main`；指向 `main` 的 URL 會回 404。

## 更新

`SKILL.md` 是快照；跟上游同步。上游預設分支是 `master`，不是 `main`，
所以務必傳 ref：

```bash
./scripts/update-skill.sh master      # 上游預設分支
./scripts/update-skill.sh v0.8.0      # 或 pin 到 tag
```

不帶 ref 執行時，腳本會用內建的預設值（`main`），那不是上游的分支，會安全地
失敗——`SKILL.md` 要通過 frontmatter 檢查後才會被取代，所以錯誤的 ref 不會
弄壞現有檔案。

也可以使用官方工具重裝：`npx skills add herdrdev/herdr --skill herdr -g`。
注意 npx 安裝的是**獨立副本**——它會把 `SKILL.md` 放到 `~/.agents/skills/herdr`，
並 symlink `~/.pi/agent/skills/herdr` 指向它。這與本 repo 的 `update-skill.sh`
是兩條獨立軌道，兩份副本**不會**自動同步；請選定一種工作流程，不要混用。

## 授權與出處

`SKILL.md` © herdrdev，Apache-2.0。本 repo 其他內容預設為 MIT。
原始檔在上游倉庫：<https://github.com/herdrdev/herdr/blob/master/skills/herdr/SKILL.md>
