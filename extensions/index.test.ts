import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
const repoDir = process.cwd();

import herdrExtension, {
	createPackageScanner,
	createProfileManager,
	computeThinkingAgentArgs,
	resolveThinkingModelClass,
	loadThinkingClasses,
	saveThinkingClass,
	thinkingClassesPath,
} from "./index";

const currentPane = {
	pane_id: "w1:p1",
	workspace_id: "w1",
	tab_id: "w1:t1",
	focused: false,
	cwd: "/repo",
	foreground_cwd: "/repo",
	agent: "pi",
	agent_status: "working",
};

const reviewer = {
	name: "reviewer",
	agent: "codex",
	display_agent: "Codex",
	agent_status: "idle",
	workspace_id: "w1",
	tab_id: "w1:t1",
	pane_id: "w1:p2",
	focused: false,
	cwd: "/repo",
};

function response(result: unknown, stdout?: string) {
	return {
		stdout: stdout ?? JSON.stringify({ id: "test", result }),
		stderr: "",
		code: 0,
		killed: false,
	};
}

function registerTools(handler: (args: string[]) => unknown | string) {
	const tools = new Map<string, any>();
	const pi = {
		registerTool(definition: any) {
			tools.set(definition.name, definition);
		},
		async exec(command: string, args: string[]) {
			expect(command).toBe("herdr");
			const result = handler(args);
			return typeof result === "string" ? response(undefined, result) : response(result);
		},
		on(_event: string, _handler: unknown) {
			// resources_discover: no-op in tests
		},
	};
	herdrExtension(pi as any);
	return tools;
}

beforeEach(() => {
	process.env.HERDR_ENV = "1";
	process.env.HERDR_PANE_ID = currentPane.pane_id;
});

afterEach(() => {
	delete process.env.HERDR_ENV;
	delete process.env.HERDR_PANE_ID;
});

describe("pi-herdr", () => {
	test("registers only inside Herdr", () => {
		delete process.env.HERDR_ENV;
		const tools = registerTools(() => ({}));
		expect(tools.size).toBe(0);
	});

	test("registers separate layout, pane, and agent primitives", () => {
		const tools = registerTools(() => ({}));
		expect([...tools.keys()]).toEqual([
			"herdr_layout",
			"herdr_pane",
			"herdr_agent",
			"herdr_profile",
			"herdr_package",
			"herdr_thinking",
		]);
		expect(tools.get("herdr_layout").description).toContain("Workspaces contain tabs; tabs contain panes");
		expect(tools.get("herdr_pane").description).toContain("ordinary processes");
		expect(tools.get("herdr_agent").description).toContain("existing Herdr pane");
		expect(tools.get("herdr_profile").description).toContain("exactly fit");
	});

	test("splits the caller pane from geometry while preserving cwd and focus", async () => {
		const calls: string[][] = [];
		const splitPane = { ...currentPane, pane_id: "w1:p2", agent: undefined, agent_status: "unknown" };
		const tools = registerTools((args) => {
			calls.push(args);
			if (args[0] === "pane" && args[1] === "current") return { type: "pane_current", pane: currentPane };
			if (args[0] === "pane" && args[1] === "layout") {
				return {
					type: "pane_layout",
					layout: {
						workspace_id: "w1",
						tab_id: "w1:t1",
						zoomed: false,
						focused_pane_id: "w1:p1",
						area: { x: 0, y: 0, width: 160, height: 40 },
						panes: [{ pane_id: "w1:p1", focused: true, rect: { x: 0, y: 0, width: 160, height: 40 } }],
						splits: [],
					},
				};
			}
			if (args[0] === "pane" && args[1] === "split") return { type: "pane_info", pane: splitPane };
			throw new Error(`unexpected command: ${args.join(" ")}`);
		});

		const result = await tools.get("herdr_layout").execute(
			"test",
			{ action: "pane_split" },
			undefined,
			undefined,
			{},
		);

		expect(calls).toContainEqual(["pane", "layout", "--pane", "w1:p1"]);
		expect(calls).toContainEqual([
			"pane",
			"split",
			"w1:p1",
			"--direction",
			"right",
			"--cwd",
			"/repo",
			"--no-focus",
		]);
		expect(result.details.pane.pane_id).toBe("w1:p2");
	});

	test("passes ratio through to split a specified pane evenly", async () => {
		const calls: string[][] = [];
		const splitPane = { ...currentPane, pane_id: "w1:p3", agent: undefined, agent_status: "unknown" };
		const tools = registerTools((args) => {
			calls.push(args);
			if (args[0] === "pane" && args[1] === "current") return { type: "pane_current", pane: currentPane };
			if (args[0] === "pane" && args[1] === "get") {
				return { type: "pane_info", pane: { ...currentPane, pane_id: "w1:p2" } };
			}
			if (args[0] === "pane" && args[1] === "split") return { type: "pane_info", pane: splitPane };
			throw new Error(`unexpected command: ${args.join(" ")}`);
		});

		const result = await tools.get("herdr_layout").execute(
			"test",
			{ action: "pane_split", pane: "w1:p2", direction: "down", ratio: 0.333 },
			undefined,
			undefined,
			{},
		);

		expect(calls).toContainEqual(["pane", "get", "w1:p2"]);
		expect(calls).toContainEqual([
			"pane",
			"split",
			"w1:p2",
			"--direction",
			"down",
			"--cwd",
			"/repo",
			"--ratio",
			"0.333",
			"--no-focus",
		]);
		expect(result.details.direction).toBe("down");
	});

	test("rejects ratio outside (0, 1)", async () => {
		const tools = registerTools(() => ({}));
		await expect(
			tools.get("herdr_layout").execute(
				"test",
				{ action: "pane_split", ratio: 1.5 },
				undefined,
				undefined,
				{},
			),
		).rejects.toThrow("ratio must be between 0 and 1");
	});

	test("waits for ordinary output through pane wait-output", async () => {
		const calls: string[][] = [];
		const tools = registerTools((args) => {
			calls.push(args);
			return {
				type: "pane_output_matched",
				pane_id: "w1:p2",
				matched_line: "server ready",
				read: { text: "booting\nserver ready\n" },
			};
		});

		const result = await tools.get("herdr_pane").execute(
			"test",
			{ action: "wait_output", pane: "w1:p2", match: "ready", timeout: 30000 },
			undefined,
			undefined,
			{},
		);

		expect(calls).toEqual([["pane", "wait-output", "w1:p2", "--match", "ready", "--timeout", "30000"]]);
		expect(result.content[0].text).toContain("server ready");
	});

	test("runs a command without requiring a JSON envelope (herdr pane run emits empty stdout)", async () => {
		const calls: string[][] = [];
		const tools = registerTools((args) => {
			calls.push(args);
			if (args[0] === "pane" && args[1] === "run") return ""; // herdr pane run: empty stdout, exit 0
			throw new Error(`unexpected command: ${args.join(" ")}`);
		});

		const result = await tools.get("herdr_pane").execute(
			"test",
			{ action: "run", pane: "w1:p2", command: "echo hi" },
			undefined,
			undefined,
			{},
		);

		expect(calls).toEqual([["pane", "run", "w1:p2", "echo hi"]]);
		expect(result.content[0].text).toContain("Submitted command to pane w1:p2");
	});

	test("refuses to close the caller pane", async () => {
		const tools = registerTools((args) => {
			if (args[0] === "pane" && args[1] === "current") return { type: "pane_current", pane: currentPane };
			throw new Error(`unexpected command: ${args.join(" ")}`);
		});

		expect(
			tools.get("herdr_pane").execute(
				"test",
				{ action: "close", pane: "w1:p1" },
				undefined,
				undefined,
				{},
			),
		).rejects.toThrow("Refusing to close");
	});

	test("starts a named agent in an existing pane", async () => {
		const calls: string[][] = [];
		const tools = registerTools((args) => {
			calls.push(args);
			return { type: "agent_started", agent: reviewer, argv: ["codex", "-m", "gpt-5.4"] };
		});

		const result = await tools.get("herdr_agent").execute(
			"test",
			{
				action: "start",
				name: "reviewer",
				kind: "codex",
				pane: "w1:p2",
				agentArgs: ["-m", "gpt-5.4"],
			},
			undefined,
			undefined,
			{},
		);

		expect(calls).toEqual([
			["agent", "start", "reviewer", "--kind", "codex", "--pane", "w1:p2", "--", "-m", "gpt-5.4"],
		]);
		expect(result.details.agent.name).toBe("reviewer");
	});

	test("prompts through the agent surface and waits by default", async () => {
		const calls: string[][] = [];
		const tools = registerTools((args) => {
			calls.push(args);
			return { type: "agent_prompted", agent: { ...reviewer, agent_status: "done" } };
		});

		const result = await tools.get("herdr_agent").execute(
			"test",
			{
				action: "prompt",
				target: "reviewer",
				prompt: "Review the current diff",
				until: ["idle", "done"],
				timeout: 120000,
			},
			undefined,
			undefined,
			{},
		);

		expect(calls).toEqual([
			[
				"agent",
				"prompt",
				"reviewer",
				"Review the current diff",
				"--wait",
				"--until",
				"idle",
				"--until",
				"done",
				"--timeout",
				"120000",
			],
		]);
		expect(result.details.agent.agent_status).toBe("done");
	});

	test("reads through the resolved agent surface", async () => {
		const calls: string[][] = [];
		const tools = registerTools((args) => {
			calls.push(args);
			return "review complete\n";
		});

		const result = await tools.get("herdr_agent").execute(
			"test",
			{ action: "read", target: "reviewer", lines: 120 },
			undefined,
			undefined,
			{},
		);

		expect(calls).toEqual([
			["agent", "read", "reviewer", "--source", "recent-unwrapped", "--lines", "120"],
		]);
		expect(result.content[0].text).toBe("review complete\n");
	});

	test("sends validated keys without expecting agent data in the response", async () => {
		const calls: string[][] = [];
		const tools = registerTools((args) => {
			calls.push(args);
			return { type: "ok" };
		});

		const result = await tools.get("herdr_agent").execute(
			"test",
			{ action: "send_keys", target: "reviewer", keys: ["esc", "ctrl+c"] },
			undefined,
			undefined,
			{},
		);

		expect(calls).toEqual([["agent", "send-keys", "reviewer", "esc", "ctrl+c"]]);
		expect(result.content[0].text).toBe("Sent esc ctrl+c to reviewer");
	});
});

describe("herdr_profile (use-or-create)", () => {
	let agentsDir: string;

	beforeEach(() => {
		agentsDir = mkdtempSync(join(tmpdir(), "herdr-profiles-"));
	});

	afterEach(() => {
		rmSync(agentsDir, { recursive: true, force: true });
	});

	function writeProfile(name: string, description: string, tools: string, body: string) {
		mkdirSync(agentsDir, { recursive: true });
		writeFileSync(
			join(agentsDir, `${name}.md`),
			`---\nname: ${name}\nversion: 0.1.0\ndescription: ${description}\ntools: ${tools}\nmodel: <由 orchestrator 依 PI_MODEL_* env 選用，勿硬編碼>\nchangelog: |\n  - 0.1.0: 初版建立。\n---\n${body}\n`,
		);
	}

	test("reuses an existing profile that is exactly fit (R expert has R task)", () => {
		writeProfile("r-expert", "R 語言統計分析專家。", "read, bash, R", "你是 R 語言專家。");
		const manager = createProfileManager(agentsDir);

		// 檢查 agents/：有完全適用的 r-expert（領域/語言/職責/工具都吻合）
		const profiles = manager.list();
		expect(profiles).toHaveLength(1);
		expect(profiles[0].name).toBe("r-expert");
		expect(profiles[0].description).toContain("R");
		expect(profiles[0].tools).toBe("read, bash, R");

		// 完全適用 → 直接 read 使用，不新建
		const body = manager.read("r-expert");
		expect(body).toContain("你是 R 語言專家。");
		expect(manager.list()).toHaveLength(1); // 沒有新增任何 profile
	});

	test("creates a new profile when none is exactly fit (C# task, only R expert exists)", () => {
		writeProfile("r-expert", "R 語言統計分析專家。", "read, bash, R", "你是 R 語言專家。");
		const manager = createProfileManager(agentsDir);

		// 需求是 C# 專家；既有 r-expert 不適用（語言/領域不符）
		expect(manager.list().map((p) => p.name)).toEqual(["r-expert"]);
		expect(manager.list().map((p) => p.name)).not.toContain("csharp-expert");

		// 沒有完全適用 → 依需求建立新 profile
		const created = manager.create({
			name: "csharp-expert",
			description: "C# 語言專家。擅長 C#/.NET 開發與審查。",
			tools: "read, bash, dotnet",
			body: "你是 C# 專家。\n\n職責：撰寫與審查 C#/.NET 程式碼。\n輸出 contract：只回結論清單。",
		});
		expect(created.name).toBe("csharp-expert");
		expect(created.version).toBe("0.1.0");

		// 檔案已寫入 agents/，frontmatter 完整
		const raw = readFileSync(join(agentsDir, "csharp-expert.md"), "utf8");
		expect(raw).toContain("name: csharp-expert");
		expect(raw).toContain("version: 0.1.0");
		expect(raw).toContain("description: C# 語言專家。擅長 C#/.NET 開發與審查。");
		expect(raw).toContain("tools: read, bash, dotnet");
		expect(raw).toContain("model: <由 orchestrator 依 PI_MODEL_* env 選用，勿硬編碼>");
		expect(raw).toContain("changelog: |");
		expect(raw).toContain("你是 C# 專家。");

		// 閉環：create 後 list 就看得到 → 下次同型別任務可直接適用
		expect(manager.list().map((p) => p.name)).toEqual(["csharp-expert", "r-expert"]);
	});

	test("creates a profile without pinning pi packages (dynamic per task)", () => {
		const manager = createProfileManager(agentsDir);
		manager.create({ name: "lit-searcher", description: "文獻檢索。", tools: "read, bash", body: "body" });
		const raw = readFileSync(join(agentsDir, "lit-searcher.md"), "utf8");
		expect(raw).not.toContain("packages:"); // pi packages 由 main agent 動態決定，不寫死在 profile
	});

	test("refuses to overwrite an existing profile", () => {
		writeProfile("lit-searcher", "文獻檢索助理（PubMed 等）。", "read, bash", "你是文獻檢索助理。");
		const manager = createProfileManager(agentsDir);
		expect(() => manager.create({ name: "lit-searcher", description: "x", tools: "read", body: "y" })).toThrow(
			/already exists/,
		);
	});

	test("rejects invalid profile names", () => {
		const manager = createProfileManager(agentsDir);
		expect(() => manager.create({ name: "CSharp Expert", description: "x", tools: "read", body: "y" })).toThrow(
			/must match/,
		);
	});

	test("lists this repo's built-in profiles", () => {
		const manager = createProfileManager(join(import.meta.dir, "..", "agents"));
		const names = manager.list().map((p) => p.name);
		expect(names).toContain("lit-searcher");
		expect(names).toContain("code-reviewer");
	});
});

describe("herdr_package (pi-package provisioning)", () => {
	let packagesDir: string;

	beforeEach(() => {
		packagesDir = mkdtempSync(join(tmpdir(), "herdr-packages-"));
	});

	afterEach(() => {
		rmSync(packagesDir, { recursive: true, force: true });
		delete process.env.PI_PACKAGES_DIR;
	});

	function writePackage(dir: string, name: string, description: string, keywords: string[], pi?: object) {
		const pkgDir = join(packagesDir, dir);
		mkdirSync(pkgDir, { recursive: true });
		writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name, description, keywords, pi }, null, 2));
	}

	test("lists pi packages with their resources and skips non-packages", () => {
		writePackage("book-to-skill", "@scope/book-to-skill", "Convert books into skills.", ["pi-package"], {
			extensions: ["./extensions"],
			skills: ["./skills"],
		});
		writePackage("plain-dir", "no-manifest", "Has a package.json but no pi field.", []);
		mkdirSync(join(packagesDir, "not-a-package"), { recursive: true }); // 無 package.json → 跳過

		const packages = createPackageScanner(packagesDir).list();
		expect(packages).toHaveLength(2);
		expect(packages[0].name).toBe("@scope/book-to-skill");
		expect(packages[0].resources).toEqual(["./extensions", "./skills"]);
		expect(packages[0].keywords).toContain("pi-package");
		expect(packages[1].name).toBe("no-manifest");
		expect(packages[1].resources).toEqual([]);
	});

	test("returns an empty list for a missing directory", () => {
		expect(createPackageScanner(join(packagesDir, "nope")).list()).toEqual([]);
	});

	test("herdr_package reports unset env and skips provisioning", async () => {
		delete process.env.PI_PACKAGES_DIR;
		const tools = registerTools(() => ({}));
		const result = await tools.get("herdr_package").execute("test", { action: "list" }, undefined, undefined, {});
		expect(result.details.envSet).toBe(false);
		expect(result.content[0].text).toContain("PI_PACKAGES_DIR is not set");
	});

	test("herdr_package lists available packages when env is set", async () => {
		writePackage("book-to-skill", "book-to-skill", "Convert books into skills.", ["pi-package"]);
		process.env.PI_PACKAGES_DIR = packagesDir;
		const tools = registerTools(() => ({}));
		const result = await tools.get("herdr_package").execute("test", { action: "list" }, undefined, undefined, {});
		expect(result.details.envSet).toBe(true);
		expect(result.details.packagesDir).toBe(packagesDir);
		expect(result.details.packages).toHaveLength(1);
		expect(result.details.packages[0].name).toBe("book-to-skill");
		expect(result.content[0].text).toContain("book-to-skill");
	});

	test("find resolves names to paths and reports missing ones", () => {
		writePackage("book-to-skill", "book-to-skill", "Convert books into skills.", []);
		writePackage("site-to-skill", "site-to-skill", "Convert sites into skills.", []);
		const { found, missing } = createPackageScanner(packagesDir).find(["book-to-skill", "no-such-pkg"]);
		expect(found.map((p) => p.name)).toEqual(["book-to-skill"]);
		expect(found[0].path).toBe(join(packagesDir, "book-to-skill"));
		expect(missing).toEqual(["no-such-pkg"]);
	});

	test("herdr_package resolve emits -e entries and skips missing ones", async () => {
		writePackage("book-to-skill", "book-to-skill", "Convert books into skills.", []);
		process.env.PI_PACKAGES_DIR = packagesDir;
		const tools = registerTools(() => ({}));
		const result = await tools
			.get("herdr_package")
			.execute("test", { action: "resolve", packages: ["book-to-skill", "ghost"] }, undefined, undefined, {});
		expect(result.details.envSet).toBe(true);
		expect(result.details.found).toHaveLength(1);
		expect(result.details.found[0].path).toBe(join(packagesDir, "book-to-skill"));
		expect(result.details.missing).toEqual(["ghost"]);
		expect(result.content[0].text).toContain(`-e ${join(packagesDir, "book-to-skill")}`);
		expect(result.content[0].text).toContain("missing: ghost");
	});

	test("herdr_package resolve skips provisioning when env is unset", async () => {
		delete process.env.PI_PACKAGES_DIR;
		const tools = registerTools(() => ({}));
		const result = await tools
			.get("herdr_package")
			.execute("test", { action: "resolve", packages: ["book-to-skill"] }, undefined, undefined, {});
		expect(result.details.envSet).toBe(false);
		expect(result.content[0].text).toContain("PI_PACKAGES_DIR is not set");
	});
});

describe("herdr_thinking (thinking-level advisor)", () => {
	test("deepseek-v4-flash is on/off only; mechanical -> off, general -> low", () => {
		const mech = computeThinkingAgentArgs("deepseek-v4-flash", "mechanical");
		expect(mech.modelClass).toBe("on-off");
		expect(mech.thinkingLevel).toBe("off");
		expect(mech.agentArgs).toEqual(["--model", "deepseek-v4-flash", "--thinking", "off"]);
		const gen = computeThinkingAgentArgs("deepseek-v4-flash", "general");
		expect(gen.thinkingLevel).toBe("low");
	});

	test("on/off-only model: arithmetic-sensitive mechanical task upgrades off -> low", () => {
		const advice = computeThinkingAgentArgs("deepseek-v4-flash", "mechanical", { needsArithmetic: true });
		expect(advice.thinkingLevel).toBe("low");
		expect(advice.notes.some((n) => n.includes("arithmetic"))).toBe(true);
	});

	test("provider prefix is stripped for family matching: some-gateway/deepseek-v4-flash is on-off", () => {
		const advice = computeThinkingAgentArgs("some-gateway/deepseek-v4-flash", "complex");
		expect(advice.modelClass).toBe("on-off");
		expect(advice.thinkingLevel).toBe("high");
	});

	test("provider/gateway rule wins over model design: opencode-go forces thinking", () => {
		const advice = computeThinkingAgentArgs("opencode-go/deepseek-v4-flash", "mechanical");
		expect(advice.modelClass).toBe("gateway-forced");
		expect(advice.thinkingLevel).toBe("low"); // off impossible -> upgraded
		expect(advice.notes.some((n) => n.includes("cannot disable"))).toBe(true);
	});

	test("Qwen3.8 family is a budget ladder; quality-critical -> high, mechanical -> off", () => {
		const hard = computeThinkingAgentArgs("cyankiwi/Qwen3.8-27B-AWQ-INT4", "quality-critical");
		expect(hard.modelClass).toBe("budget-ladder");
		expect(hard.thinkingLevel).toBe("high");
		const mech = computeThinkingAgentArgs("qwen3.8-27b", "mechanical");
		expect(mech.thinkingLevel).toBe("off");
	});

	test("unknown models get conservative defaults plus a probe note", () => {
		const advice = computeThinkingAgentArgs("some-new-model/xyz", "complex");
		expect(advice.modelClass).toBe("unknown");
		expect(advice.thinkingLevel).toBe("medium");
		expect(advice.notes.some((n) => n.includes("probe"))).toBe(true);
	});

	test("resolveThinkingModelClass reports the matched family", () => {
		const r = resolveThinkingModelClass("deepseek-v4-pro");
		expect(r.modelClass).toBe("on-off");
		expect(r.reason).toContain("DeepSeek V4");
	});

	test("capability table: missing file yields empty table (fresh clone, table is gitignored)", () => {
		const missing = join(mkdtempSync(join(tmpdir(), "pi-think-none-")), "thinking-classes.json");
		expect(loadThinkingClasses(missing)).toEqual({});
		rmSync(dirname(missing), { recursive: true, force: true });
	});

	test("capability table example file parses and classifies", () => {
		const classes = loadThinkingClasses(join(repoDir, "agents", "thinking-classes.example.json"));
		expect(classes["example-model-a"]?.class).toBe("budget-ladder");
		expect(classes["example-model-b"]?.class).toBe("on-off");
		const advice = computeThinkingAgentArgs("example-model-a", "quality-critical", { classes });
		expect(advice.modelClass).toBe("budget-ladder");
	});

	test("recorded class overrides family rules and persists", () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-think-"));
		try {
			const f = join(dir, "thinking-classes.json");
			const { entries } = saveThinkingClass(f, "newmodel-7b", "gateway-forced", "probed: reasoning emitted with off");
			expect(entries["newmodel-7b"].class).toBe("gateway-forced");
			const reloaded = loadThinkingClasses(f);
			expect(reloaded["newmodel-7b"].evidence).toContain("probed");
			// recorded class wins over family rule (name contains deepseek would otherwise be on-off)
			saveThinkingClass(f, "deepseek-v4-flash", "gateway-forced", "probed override");
			const advice = computeThinkingAgentArgs("deepseek-v4-flash", "mechanical", { classes: loadThinkingClasses(f) });
			expect(advice.modelClass).toBe("gateway-forced");
			expect(advice.thinkingLevel).toBe("low"); // off impossible
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("computeThinkingAgentArgs reports table-sourced classes", () => {
		const classes = { "qwen3.8-27b": { class: "budget-ladder" as const } };
		const advice = computeThinkingAgentArgs("qwen3.8-27b-awq-int4", "general", { classes });
		expect(advice.modelClass).toBe("budget-ladder");
		expect(advice.notes.some((n) => n.includes("capability table"))).toBe(true);
	});

	test("list action shows known models from the capability table ($PI_THINKING_CLASSES)", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-think-list-"));
		const f = join(dir, "classes.json");
		saveThinkingClass(f, "alpha-1b", "on-off", "probed locally");
		saveThinkingClass(f, "beta-2b", "budget-ladder");
		const prev = process.env.PI_THINKING_CLASSES;
		try {
			process.env.PI_THINKING_CLASSES = f;
			const tools = registerTools(() => ({}));
			const result = await tools.get("herdr_thinking").execute("t1", { action: "list" }, undefined, undefined, undefined);
			const text = result.content[0].text;
			expect(text).toContain("alpha-1b -> on-off");
			expect(text).toContain("beta-2b -> budget-ladder");
			expect(result.details.action).toBe("list");
			expect(result.details.entries["alpha-1b"].evidence).toBe("probed locally");
		} finally {
			if (prev === undefined) delete process.env.PI_THINKING_CLASSES;
			else process.env.PI_THINKING_CLASSES = prev;
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("environment override PI_THINKING_CLASSES changes the advised table", () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-think-env-"));
		const f = join(dir, "classes.json");
		saveThinkingClass(f, "gamma-3b", "gateway-forced", "env override");
		const prev = process.env.PI_THINKING_CLASSES;
		try {
			process.env.PI_THINKING_CLASSES = f;
			const advice = computeThinkingAgentArgs("gamma-3b", "mechanical", {
				classes: loadThinkingClasses(thinkingClassesPath()),
			});
			expect(advice.modelClass).toBe("gateway-forced");
			expect(advice.thinkingLevel).toBe("low");
		} finally {
			if (prev === undefined) delete process.env.PI_THINKING_CLASSES;
			else process.env.PI_THINKING_CLASSES = prev;
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
