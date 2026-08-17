import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import herdrExtension, { createProfileManager } from "./index";

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
		expect([...tools.keys()]).toEqual(["herdr_layout", "herdr_pane", "herdr_agent", "herdr_profile"]);
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
		const manager = createProfileManager(join(import.meta.dir, "agents"));
		const names = manager.list().map((p) => p.name);
		expect(names).toContain("lit-searcher");
		expect(names).toContain("code-reviewer");
	});
});
