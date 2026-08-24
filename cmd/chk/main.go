package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ChkConfig represents the chk.json schema
type ChkConfig struct {
	Plan  string              `json:"plan"`
	Steps map[string]ChkStep  `json:"steps"`
}

// ChkStep represents a single checkpoint step
type ChkStep struct {
	Title          string `json:"title"`
	ExpectedResult string `json:"expected_result"`
	StepContent    string `json:"step_content,omitempty"`
	NextOnPass     string `json:"next_on_pass,omitempty"`
	Help           string `json:"help"`
}

// ChkState represents the persistent state file
type ChkState struct {
	Results  map[string]string `json:"results"`
	HMAC     string            `json:"hmac,omitempty"`
}

func main() {
	showHelp := false
	listSteps := false
	resetState := false
	showStep := false
	step := ""
	result := ""
	configPath := ""

	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--help", "-h":
			showHelp = true
		case "--list", "-l":
			listSteps = true
		case "--step", "-s":
			if i+1 < len(args) {
				i++
				step = args[i]
			}
		case "--show", "-S":
			showStep = true
		case "--result", "-r":
			if i+1 < len(args) {
				i++
				result = args[i]
			}
		case "--file", "-f":
			if i+1 < len(args) {
				i++
				configPath = args[i]
			}
		case "--reset", "--clear":
			resetState = true
		}
	}

	cfg, cfgDir, cfgPath, err := loadConfig(configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "錯誤: 無法載入 chk.json: %v\n", err)
		os.Exit(1)
	}

	// Derive signing key from chk.json content to protect state integrity
	signingKey := deriveSigningKey(cfgDir, cfgPath)

	statePath := filepath.Join(cfgDir, ".chkstate.json")

	if resetState {
		if err := writeState(statePath, &ChkState{Results: map[string]string{}}, signingKey); err != nil {
			fmt.Fprintf(os.Stderr, "錯誤: 無法重置狀態: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("狀態已重置 ✅")
		os.Exit(0)
	}

	state := loadState(statePath, signingKey)

	if step == "" && !listSteps {
		printUsage()
		os.Exit(0)
	}

	if listSteps {
		fmt.Printf("計畫: %s\n", cfg.Plan)
		fmt.Println("步驟清單:")
		for _, k := range sortedKeys(cfg.Steps) {
			s := cfg.Steps[k]
			status := "⚠️  未檢查"
			if r, ok := state.Results[k]; ok {
				if r == s.ExpectedResult {
					status = "✅ PASS"
				} else {
					status = fmt.Sprintf("❌ FAIL (%s)", r)
				}
			}
			fmt.Printf("  %s: %s [%s]\n", padRight(k, 6), s.Title, status)
		}
		os.Exit(0)
	}

	stepDef, ok := cfg.Steps[step]
	if !ok {
		fmt.Fprintf(os.Stderr, "錯誤: 步驟 %s 不存在\n", step)
		fmt.Fprintf(os.Stderr, "可用步驟: %s\n", strings.Join(sortedKeys(cfg.Steps), ", "))
		os.Exit(1)
	}

	// Check dependency: all previous steps must pass before we can access this step
	if !canAccessStep(step, cfg, state) {
		fmt.Fprintf(os.Stderr, "❌ 步驟 %s 的上一步驟尚未通過。\n", step)
		fmt.Fprintf(os.Stderr, "請先完成上一步驟並通過 chk 檢查。\n")
		fmt.Fprintf(os.Stderr, "使用 'chk --list' 查看當前狀態。\n")
		os.Exit(1)
	}

	// --step <N> --show: show step content (only if dependency passed)
	if showStep {
		if stepDef.StepContent != "" {
			fmt.Println(stepDef.StepContent)
		} else {
			fmt.Fprintf(os.Stderr, "步驟 %s 沒有 step_content 定義。\n", step)
			os.Exit(1)
		}
		os.Exit(0)
	}

	// --step <N> --help: show help + acceptance criteria
	if showHelp {
		printStepHelp(step, stepDef, state)
		os.Exit(0)
	}

	if result == "" {
		fmt.Fprintf(os.Stderr, "錯誤: 需要 --result 參數。使用 --help 查看可接受的結果編碼。\n")
		os.Exit(1)
	}

	expected := stepDef.ExpectedResult
	if result == expected {
		state.Results[step] = result
		if err := writeState(statePath, state, signingKey); err != nil {
			fmt.Fprintf(os.Stderr, "警告: 無法寫入狀態: %v\n", err)
		}
		fmt.Printf("PASS ✅ 步驟 %s (%s) 通過。\n", step, stepDef.Title)
		if stepDef.NextOnPass != "" {
			fmt.Println()
			fmt.Println("📖 下一步:")
			fmt.Println(stepDef.NextOnPass)
		}
		os.Exit(0)
	} else {
		fmt.Printf("FAIL ❌ 步驟 %s (%s) 未通過。\n", step, stepDef.Title)
		fmt.Printf("  預期結果: '%s'\n", expected)
		fmt.Printf("  實際結果: '%s'\n", result)
		fmt.Println()
		fmt.Println("檢查以下項目:")
		lines := extractChecklist(stepDef.Help)
		for _, line := range lines {
			fmt.Printf("  - %s\n", line)
		}
		fmt.Println()
		fmt.Printf("使用 'chk --step %s --help' 查看完整驗收標準。\n", step)
		os.Exit(1)
	}
}

// canAccessStep checks if all prerequisite steps have passed.
// Prerequisite = any step whose ID is strictly less than this step.
// For branch steps like "2a", the prerequisite is "2" (must not have passed "2" yet).
// For main steps like "2", prerequisite is "1" (must have passed "1").
func canAccessStep(step string, cfg *ChkConfig, state *ChkState) bool {
	// Step 0 has no prerequisites
	if step == "0" {
		return true
	}

	// Find the immediate prerequisite step ID
	prereq := findPrerequisite(step, cfg)

	// If no prerequisite found, allow access (fallback)
	if prereq == "" {
		return true
	}

	// Check if prerequisite passed
	r, ok := state.Results[prereq]
	return ok && r == cfg.Steps[prereq].ExpectedResult
}

// findPrerequisite determines the prerequisite step ID.
// For "2a", prereq is "2" (but only if "2" hasn't passed yet — it's a sub-step of 2)
// For "2", prereq is "1"
// For "2b-3", prereq is "2b"
func findPrerequisite(step string, cfg *ChkConfig) string {
	// Get sorted keys
	keys := sortedKeys(cfg.Steps)

	// Find our position
	ourIdx := -1
	for i, k := range keys {
		if k == step {
			ourIdx = i
			break
		}
	}

	if ourIdx <= 0 {
		return ""
	}

	// The immediate previous step in sorted order is the prerequisite
	return keys[ourIdx-1]
}

func loadConfig(path string) (*ChkConfig, string, string, error) {
	configPath := path
	if configPath == "" {
		dir, err := os.Getwd()
		if err != nil {
			return nil, "", "", err
		}
		for {
			candidate := filepath.Join(dir, "chk.json")
			if _, err := os.Stat(candidate); err == nil {
				configPath = candidate
				break
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}

	if configPath == "" {
		return nil, "", "", fmt.Errorf("找不到 chk.json。請在 plan-skill 目錄或上層目錄放置 chk.json。")
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, "", "", fmt.Errorf("讀取 %s 失敗: %w", configPath, err)
	}

	var cfg ChkConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, "", "", fmt.Errorf("解析 %s 失敗: %w", configPath, err)
	}

	if cfg.Steps == nil {
		return nil, "", "", fmt.Errorf("%s 中沒有定義任何步驟", configPath)
	}

	cfgDir := filepath.Dir(configPath)
	return &cfg, cfgDir, configPath, nil
}

func loadState(path string, signingKey []byte) *ChkState {
	data, err := os.ReadFile(path)
	if err != nil {
		return &ChkState{Results: map[string]string{}}
	}
	var state ChkState
	if err := json.Unmarshal(data, &state); err != nil {
		return &ChkState{Results: map[string]string{}}
	}
	if state.Results == nil {
		state.Results = map[string]string{}
	}

	// Verify HMAC integrity
	storedHMAC := state.HMAC
	state.HMAC = ""
	if storedHMAC != "" {
		// Verify HMAC
		cleanData, _ := json.MarshalIndent(state, "", "  ")
		expectedMAC := computeHMAC(cleanData, signingKey)
		if storedHMAC != expectedMAC {
			fmt.Fprintf(os.Stderr, "⚠️  警告: .chkstate.json 已被竄改，完整性驗證失敗。重置狀態。\n")
			return &ChkState{Results: map[string]string{}}
		}
	}
	state.HMAC = storedHMAC
	return &state
}

func writeState(path string, state *ChkState, signingKey []byte) error {
	// Clear HMAC before marshaling, then compute MAC
	state.HMAC = ""
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	state.HMAC = computeHMAC(data, signingKey)
	// Re-marshal with HMAC
	dataWithHMAC, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, dataWithHMAC, 0644)
}

func computeHMAC(data []byte, key []byte) string {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return hex.EncodeToString(mac.Sum(nil))
}

func deriveSigningKey(cfgDir string, configPath string) []byte {
	// Key = SHA256(cfgDir + chk.json_content)
	// Deterministic: same chk.json always produces the same key.
	// This is NOT a security mechanism against intentional forgery.
	// It only prevents accidental state corruption / trivial text editing.
	h := sha256.New()
	h.Write([]byte(cfgDir))
	data, err := os.ReadFile(configPath)
	if err == nil {
		h.Write(data)
	}
	return h.Sum(nil)
}

func printStepHelp(step string, stepDef ChkStep, state *ChkState) {
	// Show the step content (task instructions) first
	if stepDef.StepContent != "" {
		fmt.Println(stepDef.StepContent)
		fmt.Println()
		fmt.Println("---")
		fmt.Println()
	}

	// Then show acceptance criteria
	fmt.Println("## 驗收標準")
	fmt.Println(stepDef.Help)
	fmt.Println()
	fmt.Println("## 相依性檢查:")
	// Show dependency info
	fmt.Printf("  ✅ 你正在執行步驟 %s\n", step)
}

func printUsage() {
	fmt.Println(`chk — Plan-Skill 驗收檢查工具

用法:
  chk --step <N> --help             顯示步驟 N 的任務內容 + 驗收標準
  chk --step <N> --show             僅顯示步驟 N 的任務內容
  chk --step <N> --result <code>    驗證並記錄步驟 N
  chk --list                        列出所有步驟與當前狀態
  chk --reset                       重置所有步驟狀態
  chk --help                        顯示此說明

選項:
  --step, -s <N>     步驟編號 (如 0, 1, 2a, 2b-3)
  --result, -r <code> 自我宣告的結果編碼
  --show, -S         顯示步驟的任務內容
  --help, -h         顯示步驟的任務內容 + 驗收標準
  --list, -l         列出所有步驟與狀態
  --reset            重置狀態
  --file, -f <path>  指定 chk.json 路徑 (預設: 自動尋找)

重要規則:
  - 未完成前一步驟就無法存取後續步驟的內容
  - 步驟內容全部嵌入 chk.json，不存放獨立 step_*.md 檔案
  - 使用 chk --step <N> --help 來查看當前步驟該做什麼

範例:
  chk --step 0 --help      # 查看 Step 0 的任務 + 驗收標準
  chk --step 0 --result PREFLIGHT_PASS  # 通過 Step 0
  chk --list               # 查看所有步驟狀態
  chk --reset              # 重置狀態`)
}

func sortedKeys(m map[string]ChkStep) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sortStrings(keys)
	return keys
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		key := s[i]
		j := i - 1
		for j >= 0 && compareStepID(s[j], key) > 0 {
			s[j+1] = s[j]
			j--
		}
		s[j+1] = key
	}
}

func compareStepID(a, b string) int {
	anum, asuffix := splitStepID(a)
	bnum, bsuffix := splitStepID(b)

	ai, aerr := parseInt(anum)
	bi, berr := parseInt(bnum)

	if aerr == nil && berr == nil {
		if ai != bi {
			if ai < bi {
				return -1
			}
			return 1
		}
	} else {
		if anum != bnum {
			if anum < bnum {
				return -1
			}
			return 1
		}
	}

	if asuffix < bsuffix {
		return -1
	}
	if asuffix > bsuffix {
		return 1
	}
	return 0
}

func parseInt(s string) (int, error) {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("not a number")
		}
		n = n*10 + int(c-'0')
	}
	return n, nil
}

func splitStepID(s string) (string, string) {
	i := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		i++
	}
	return s[:i], s[i:]
}

func padRight(s string, n int) string {
	if len(s) >= n {
		return s
	}
	return s + strings.Repeat(" ", n-len(s))
}

func extractChecklist(help string) []string {
	var items []string
	for _, line := range strings.Split(help, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "- [ ]") {
			items = append(items, strings.TrimSpace(trimmed[5:]))
		} else if strings.HasPrefix(trimmed, "- [x]") {
			items = append(items, strings.TrimSpace(trimmed[5:]))
		}
	}
	return items
}