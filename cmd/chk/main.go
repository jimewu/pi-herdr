package main

import (
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
	Help           string `json:"help"`
	NextOnPass     string `json:"next_on_pass,omitempty"`
}

// ChkState represents the persistent state file
type ChkState struct {
	Results map[string]string `json:"results"`
}

func main() {
	// Parse args
	showHelp := false
	listSteps := false
	resetState := false
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

	// Load config (find the directory where chk.json lives)
	cfg, cfgDir, err := loadConfig(configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "錯誤: 無法載入 chk.json: %v\n", err)
		os.Exit(1)
	}

	// State file path
	statePath := filepath.Join(cfgDir, ".chkstate.json")

	// --reset
	if resetState {
		if err := writeState(statePath, &ChkState{Results: map[string]string{}}); err != nil {
			fmt.Fprintf(os.Stderr, "錯誤: 無法重置狀態: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("狀態已重置 ✅")
		os.Exit(0)
	}

	// Load state
	state := loadState(statePath)

	// If no step specified with --list, or just --help without --step, show usage
	if step == "" && !listSteps {
		printUsage()
		os.Exit(0)
	}

	// --list
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

	// --step <N> --help
	if showHelp {
		printStepHelp(step, stepDef, state)
		os.Exit(0)
	}

	// --step <N> (without --result)
	if result == "" {
		fmt.Fprintf(os.Stderr, "錯誤: 需要 --result 參數。使用 --help 查看可接受的結果編碼。\n")
		os.Exit(1)
	}

	// --step <N> --result <code>
	expected := stepDef.ExpectedResult
	if result == expected {
		// Record the pass in state
		state.Results[step] = result
		if err := writeState(statePath, state); err != nil {
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

func loadConfig(path string) (*ChkConfig, string, error) {
	if path == "" {
		// Try current directory, then parent
		dir, err := os.Getwd()
		if err != nil {
			return nil, "", err
		}
		for {
			candidate := filepath.Join(dir, "chk.json")
			if _, err := os.Stat(candidate); err == nil {
				path = candidate
				break
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}

	if path == "" {
		return nil, "", fmt.Errorf("找不到 chk.json。請在 plan-skill 目錄或上層目錄放置 chk.json。")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, "", fmt.Errorf("讀取 %s 失敗: %w", path, err)
	}

	var cfg ChkConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, "", fmt.Errorf("解析 %s 失敗: %w", path, err)
	}

	if cfg.Steps == nil {
		return nil, "", fmt.Errorf("%s 中沒有定義任何步驟", path)
	}

	cfgDir := filepath.Dir(path)
	return &cfg, cfgDir, nil
}

func loadState(path string) *ChkState {
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
	return &state
}

func writeState(path string, state *ChkState) error {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func printStepHelp(step string, stepDef ChkStep, state *ChkState) {
	fmt.Println(stepDef.Help)
	fmt.Println()
	// Show dependencies: check if previous steps passed
	keys := sortedKeysFromState(state)
	fmt.Println("相依性檢查:")
	for _, k := range keys {
		if k == step {
			break
		}
		r, ok := state.Results[k]
		if ok && r != "" {
			fmt.Printf("  ✅ 步驟 %s: 已完成\n", k)
		} else {
			fmt.Printf("  ❌ 步驟 %s: 尚未通過 — 請先完成此步驟\n", k)
		}
	}
}

func sortedKeysFromState(state *ChkState) []string {
	keys := make([]string, 0, len(state.Results))
	for k := range state.Results {
		keys = append(keys, k)
	}
	sortStrings(keys)
	return keys
}

func printUsage() {
	fmt.Println(`chk — Plan-Skill 驗收檢查工具

用法:
  chk --step <N> [--result <code>]  驗證並記錄步驟 N
  chk --step <N> --help             顯示步驟 N 的驗收標準及相依性
  chk --list                        列出所有步驟與當前狀態
  chk --reset                       重置所有步驟狀態
  chk --help                        顯示此說明

選項:
  --step, -s <N>     步驟編號 (如 0, 1, 2a, 2b-3)
  --result, -r <code> 自我宣告的結果編碼
  --help, -h         顯示說明
  --list, -l         列出所有步驟與狀態
  --reset            重置狀態
  --file, -f <path>  指定 chk.json 路徑 (預設: 自動尋找)

範例:
  chk --step 0 --result PREFLIGHT_PASS
  chk --step 1 --help
  chk --list
  chk --reset`)
}

func sortedKeys(m map[string]ChkStep) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// Simple sort: natural order for numeric-like keys
	// For simplicity, string sort is fine for most plan-skill numbering
	sortStrings(keys)
	return keys
}

func sortStrings(s []string) {
	// Insertion sort by step ID
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

// compareStepID compares step IDs like "0", "1", "2a", "2b", "2b-3"
// Returns -1 if a < b, 0 if equal, 1 if a > b
func compareStepID(a, b string) int {
	anum, asuffix := splitStepID(a)
	bnum, bsuffix := splitStepID(b)

	// Compare as integers if possible
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
		// Fallback to string comparison
		if anum != bnum {
			if anum < bnum {
				return -1
			}
			return 1
		}
	}

	// Same numeric prefix, compare suffix (e.g., "a" < "b" < "b-1")
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
	// Find the first non-digit character
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

// extractChecklist extracts checklist items from help text
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