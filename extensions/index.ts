import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateTail } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

/**
 * pi-herdr strategy layer for pi.
 *
 * The three tools below (herdr_layout, herdr_pane, herdr_agent) are derived from
 * ogulcancelik's pi-herdr extension (MIT, https://github.com/ogulcancelik/pi-herdr)
 * with local adaptations:
 *   - invocation policy aligned with this repo's SKILL.md (strategy layer): the
 *     skill may suggest proactive use for delegable work; tools wait for user
 *     agreement before acting.
 *   - resources_discover registers this repo's SKILL.md as a discoverable skill.
 *
 * `pi -e .` from this directory loads everything (tools + skill).
 */

const extensionDir = dirname(fileURLToPath(import.meta.url));
// Repo layout: extensions/ (this file), skills/herdr-with-pi/, agents/, …
const repoRoot = dirname(extensionDir);
const skillPath = join(repoRoot, "skills", "herdr-with-pi", "SKILL.md");
const profileManagerDir = join(repoRoot, "agents");

type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";
type ReadSource = "visible" | "recent" | "recent-unwrapped" | "detection";
type WaitOutputSource = Exclude<ReadSource, "detection">;
type SplitDirection = "right" | "down";
type OutputFormat = "text" | "ansi";

interface WorkspaceInfo {
	workspace_id: string;
	label: string;
	focused: boolean;
	agent_status: AgentStatus;
}

interface TabInfo {
	tab_id: string;
	workspace_id: string;
	label: string;
	focused: boolean;
	agent_status: AgentStatus;
}

interface PaneInfo {
	pane_id: string;
	workspace_id: string;
	tab_id: string;
	focused: boolean;
	cwd?: string;
	foreground_cwd?: string;
	label?: string;
	agent?: string;
	agent_status: AgentStatus;
}

interface AgentInfo {
	name?: string;
	agent?: string;
	display_agent?: string;
	agent_status: AgentStatus;
	workspace_id: string;
	tab_id: string;
	pane_id: string;
	focused: boolean;
	cwd?: string;
}

interface PaneLayoutRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface PaneLayoutSnapshot {
	workspace_id: string;
	tab_id: string;
	zoomed: boolean;
	focused_pane_id: string;
	area: PaneLayoutRect;
	panes: Array<{ pane_id: string; focused: boolean; rect: PaneLayoutRect }>;
	splits: Array<{ id: string; direction: SplitDirection; ratio: number; rect: PaneLayoutRect }>;
}

interface HerdrJsonEnvelope {
	result?: unknown;
	error?: {
		code?: string;
		message?: string;
	};
}

/**
 * Subagent profile management for this repo's agents/ directory.
 *
 * The strategy rule (SKILL.md, and the herdr_profile tool description) is:
 * before spawning a subagent, check whether agents/ already has a profile that
 * is *exactly* fit for the task (domain/language/responsibility/tools all
 * match); if yes, use it; if no, create a new one via herdr_profile create.
 */

interface ProfileInfo {
	name: string;
	version?: string;
	description?: string;
	tools?: string;
}

interface ProfileFrontmatter {
	name?: string;
	version?: string;
	description?: string;
	tools?: string;
	model?: string;
	[key: string]: string | undefined;
}

const PROFILE_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

function parseFrontmatter(content: string): { metadata: ProfileFrontmatter; body: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { metadata: {}, body: content };
	const metadata: ProfileFrontmatter = {};
	for (const line of match[1].split(/\r?\n/)) {
		const colon = line.indexOf(":");
		if (colon <= 0) continue;
		const key = line.slice(0, colon).trim();
		const value = line.slice(colon + 1).trim();
		if (key && value && key !== "changelog") metadata[key] = value;
	}
	return { metadata, body: match[2] ?? "" };
}

function buildProfileMarkdown(input: {
	name: string;
	description: string;
	tools: string;
	body: string;
	version?: string;
	changelog?: string;
}): string {
	const version = input.version ?? "0.1.0";
	const changelog = input.changelog ?? `  - 0.1.0: 初版建立。由 orchestrator 依需求建立。`;
	return `---\nname: ${input.name}\nversion: ${version}\ndescription: ${input.description}\ntools: ${input.tools}\nmodel: <由 orchestrator 依 PI_MODEL_* env 選用，勿硬編碼>\nchangelog: |\n${changelog}\n---\n${input.body.trim()}\n`;
}

/**
 * Factory for profile operations against an agents/ directory. Exported so
 * tests can exercise list/read/create against a temp directory.
 */
export function createProfileManager(agentsDir: string) {
	const profilePath = (name: string) => join(agentsDir, `${name}.md`);

	function list(): ProfileInfo[] {
		if (!existsSync(agentsDir)) return [];
		return readdirSync(agentsDir)
			.filter((entry) => entry.endsWith(".md"))
			.map((entry) => {
				const { metadata } = parseFrontmatter(readFileSync(join(agentsDir, entry), "utf8"));
				const name = metadata.name || entry.slice(0, -3);
				return {
					name,
					version: metadata.version,
					description: metadata.description,
					tools: metadata.tools,
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	function read(name: string): string | null {
		const path = profilePath(name);
		if (!existsSync(path)) return null;
		return readFileSync(path, "utf8");
	}

	function create(input: { name: string; description: string; tools: string; body: string }): ProfileInfo {
		if (!PROFILE_NAME_PATTERN.test(input.name)) {
			throw new Error(
				`profile name must match ${PROFILE_NAME_PATTERN}, got ${JSON.stringify(input.name)}`,
			);
		}
		const path = profilePath(input.name);
		if (existsSync(path)) {
			throw new Error(`profile ${input.name} already exists in ${agentsDir}; use it or extend it instead`);
		}
		mkdirSync(agentsDir, { recursive: true });
		writeFileSync(path, buildProfileMarkdown(input), "utf8");
		return { name: input.name, version: "0.1.0", description: input.description, tools: input.tools };
	}

	return { list, read, create };
}

/**
 * Pi-package discovery for subagent tool provisioning.
 *
 * The strategy rule (SKILL.md, and the herdr_package tool description): when
 * the PI_PACKAGES_DIR env var is set, the main agent lists available pi
 * packages before spawning a subagent, picks the ones the subagent's task
 * needs, and passes them via `pi -e <dir>` in herdr_agent start agentArgs.
 * When the var is unset the flow works as before (no tool provisioning).
 */

interface PackageInfo {
	name: string;
	path: string;
	description?: string;
	keywords?: string[];
	resources: string[];
}

/**
 * Factory for scanning a directory of pi packages (each subdirectory with a
 * package.json counts as a package). Exported so tests can exercise it
 * against a temp directory.
 */
export function createPackageScanner(packagesDir: string) {
	function list(): PackageInfo[] {
		if (!existsSync(packagesDir)) return [];
		return readdirSync(packagesDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry): PackageInfo | null => {
				const manifestPath = join(packagesDir, entry.name, "package.json");
				if (!existsSync(manifestPath)) return null;
				try {
					const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
						name?: string;
						description?: string;
						keywords?: string[];
						pi?: { extensions?: string[]; skills?: string[] };
					};
					const name = manifest.name || entry.name;
					const resources = [
						...(manifest.pi?.extensions || []),
						...(manifest.pi?.skills || []),
					];
					return {
						name,
						path: join(packagesDir, entry.name),
						description: manifest.description,
						keywords: manifest.keywords,
						resources,
					};
				} catch {
					return null; // unreadable package.json — skip
				}
			})
			.filter((pkg): pkg is PackageInfo => pkg !== null)
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	function find(names: string[]): { found: PackageInfo[]; missing: string[] } {
		const all = list();
		const found: PackageInfo[] = [];
		const missing: string[] = [];
		for (const name of names) {
			const match = all.find((pkg) => pkg.name === name);
			if (match) found.push(match);
			else missing.push(name);
		}
		return { found, missing };
	}

	return { list, find };
}

const StatusEnum = StringEnum(["idle", "working", "blocked", "done", "unknown"] as const, {
	description: "Agent lifecycle state",
});

const ReadSourceEnum = StringEnum(["visible", "recent", "recent-unwrapped", "detection"] as const, {
	description: "Terminal snapshot source",
});

const OutputFormatEnum = StringEnum(["text", "ansi"] as const, {
	description: "Output format; ansi preserves terminal styling",
});

const DirectionEnum = StringEnum(["right", "down"] as const, {
	description: "Split direction. When omitted, the tool chooses from the source pane geometry.",
});

const AgentKindEnum = StringEnum(
	[
		"pi",
		"claude",
		"codex",
		"gemini",
		"cursor",
		"devin",
		"agy",
		"cline",
		"omp",
		"mastracode",
		"opencode",
		"copilot",
		"kimi",
		"kiro",
		"droid",
		"amp",
		"grok",
		"hermes",
		"kilo",
		"qodercli",
		"maki",
	] as const,
	{ description: "Supported coding agent kind and canonical executable" },
);

function parseHerdrError(output: string): string | null {
	const trimmed = output.trim();
	if (!trimmed) return null;
	try {
		const value = JSON.parse(trimmed) as HerdrJsonEnvelope;
		return value.error?.message || value.error?.code || trimmed;
	} catch {
		return trimmed;
	}
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
	return signal?.aborted === true || (error instanceof Error && error.message === "Aborted");
}

function formatOutput(output: string): string {
	const truncation = truncateTail(output, {
		maxLines: DEFAULT_MAX_LINES,
		maxBytes: DEFAULT_MAX_BYTES,
	});
	if (!truncation.truncated) return truncation.content;
	return `[Showing last ${truncation.outputLines} of ${truncation.totalLines} lines]\n${truncation.content}`;
}

function chooseSplitDirection(layout: PaneLayoutSnapshot, paneId: string): SplitDirection {
	const pane = layout.panes.find((candidate) => candidate.pane_id === paneId);
	if (!pane) return "right";
	return pane.rect.width >= 80 && pane.rect.width >= pane.rect.height * 2 ? "right" : "down";
}

function statusDot(theme: any, status: AgentStatus): string {
	switch (status) {
		case "blocked":
			return theme.fg("warning", "●");
		case "working":
			return theme.fg("accent", "●");
		case "done":
			return theme.fg("success", "●");
		case "idle":
			return theme.fg("muted", "○");
		default:
			return theme.fg("dim", "·");
	}
}

function agentDisplayName(agent: AgentInfo): string {
	return agent.name || agent.display_agent || agent.agent || agent.pane_id;
}

function summarizeAgent(agent: AgentInfo): string {
	const cwd = agent.cwd ? ` ${agent.cwd}` : "";
	return `${agentDisplayName(agent)}: [${agent.pane_id}] (${agent.agent_status}${agent.focused ? ", focused" : ""})${cwd}`;
}

function summarizePane(pane: PaneInfo, currentPaneId?: string): string {
	const flags = [
		pane.pane_id === currentPaneId ? "current" : pane.focused ? "focused" : null,
		pane.agent,
		pane.agent_status !== "unknown" ? pane.agent_status : null,
	]
		.filter(Boolean)
		.join(", ");
	const cwd = pane.foreground_cwd || pane.cwd;
	return `${pane.label || pane.pane_id}: [${pane.pane_id}]${flags ? ` (${flags})` : ""}${cwd ? ` ${cwd}` : ""}`;
}

function summarizeTab(tab: TabInfo): string {
	const flags = [tab.focused ? "focused" : null, tab.agent_status !== "unknown" ? tab.agent_status : null]
		.filter(Boolean)
		.join(", ");
	return `${tab.label}: [${tab.tab_id}]${flags ? ` (${flags})` : ""}`;
}

function summarizeWorkspace(workspace: WorkspaceInfo): string {
	const flags = [
		workspace.focused ? "focused" : null,
		workspace.agent_status !== "unknown" ? workspace.agent_status : null,
	]
		.filter(Boolean)
		.join(", ");
	return `${workspace.label}: [${workspace.workspace_id}]${flags ? ` (${flags})` : ""}`;
}

function renderToolCall(tool: string, args: Record<string, any>, theme: any, context: any) {
	const component = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
	let text = theme.fg("toolTitle", theme.bold(`${tool} `));
	text += theme.fg("accent", args.action || "?");
	const target = args.target || args.pane || args.tab || args.workspace;
	if (target) text += theme.fg("muted", ` ${target}`);
	if (args.name) text += theme.fg("muted", ` ${args.name}`);
	if (args.kind) text += theme.fg("dim", ` › ${args.kind}`);
	if (args.direction) text += theme.fg("dim", ` › ${args.direction}`);
	if (args.command) text += theme.fg("dim", ` › ${args.command}`);
	if (args.prompt) text += theme.fg("dim", ` › ${args.prompt}`);
	if (args.match) text += theme.fg("dim", ` › ${args.match}`);
	component.setText(text);
	return component;
}

function renderToolResult(result: any, options: { expanded: boolean; isPartial: boolean }, theme: any) {
	if (options.isPartial) return new Text(theme.fg("warning", "◌ waiting"), 0, 0);
	const details = result.details as Record<string, any> | undefined;
	const content = result.content?.[0];
	const rawText = content?.type === "text" ? content.text : "";
	if (!details) return new Text(rawText, 0, 0);

	if (details.agent) {
		const agent = details.agent as AgentInfo;
		return new Text(
			`${statusDot(theme, agent.agent_status)} ${theme.fg("accent", agentDisplayName(agent))} ${theme.fg("dim", agent.agent_status)}`,
			0,
			0,
		);
	}
	if (Array.isArray(details.agents)) {
		const agents = details.agents as AgentInfo[];
		return new Text(
			agents.length
				? agents
					.map(
						(agent) =>
							`${statusDot(theme, agent.agent_status)} ${theme.fg(agent.focused ? "accent" : "muted", agentDisplayName(agent))} ${theme.fg("dim", agent.agent_status)}`,
					)
					.join("\n")
				: theme.fg("dim", "no agents"),
			0,
			0,
		);
	}
	if (details.read) {
		let text = theme.fg("accent", `▤ ${details.target || details.pane}`);
		if (options.expanded && rawText) text += `\n${rawText.split("\n").slice(0, 40).map((line: string) => theme.fg("dim", line)).join("\n")}`;
		return new Text(text, 0, 0);
	}
	return new Text(theme.fg("success", `✓ ${details.action || "done"}`), 0, 0);
}

export type ThinkingDifficulty =
	| "mechanical"
	| "general"
	| "complex"
	| "quality-critical";

export type ThinkingModelClass =
	| "budget-ladder" // off + per-level thinking budget (settings.json thinkingBudgets); depth actually changes
	| "on-off" // only on/off meaningful; depth params accepted by the server but inert
	| "gateway-forced" // thinking cannot be turned off; levels mostly affect cost
	| "unknown";

export interface ThinkingRule {
	pattern?: RegExp; // bare model id match (model-design family)
	providerPattern?: RegExp; // provider prefix match (serving behavior)
	modelClass: ThinkingModelClass;
	reason: string;
}

/**
 * Layer 1: public serving gateways. Behavior is gateway-side, not model-side —
 * the same model id can be on/off-capable on one endpoint and forced on another.
 */
const THINKING_PROVIDER_RULES: ThinkingRule[] = [
	{
		providerPattern: /^(opencode|opencode-go)$/i,
		modelClass: "gateway-forced",
		reason: "opencode gateway forces thinking; thinking:disabled is ignored (measured)",
	},
];

/**
 * Layer 2: model-design families (public model ids). Capability here describes
 * the model's own thinking design, not any specific machine/provider.
 */
const THINKING_MODEL_RULES: ThinkingRule[] = [
	{
		pattern: /^deepseek-v4-/i,
		modelClass: "on-off",
		reason: "DeepSeek V4 family: reasoning_effort accepted but inert; only on/off is meaningful (measured)",
	},
	{
		pattern: /^qwen3\.(5|6|8)-/i,
		modelClass: "budget-ladder",
		reason: "Qwen3.5/3.6/3.8 family: thinking_token_budget depth ladder, off works (measured)",
	},
	{
		pattern: /^qwen3-/i,
		modelClass: "budget-ladder",
		reason: "Qwen3 family: thinking on/off + depth control (details depend on serving)",
	},
];

/** Difficulty → pi thinking level, per model capability class. */
export const THINKING_LEVELS_BY_CLASS: Record<
	ThinkingModelClass,
	Record<ThinkingDifficulty, string>
> = {
	// depth = thinking_token_budget; measured quality floor at minimal (1024), cliff below it
	"budget-ladder": {
		mechanical: "off",
		general: "minimal",
		complex: "medium",
		"quality-critical": "high",
	},
	// any level >= minimal means "thinking on" for this class; the number is cosmetic
	"on-off": {
		mechanical: "off",
		general: "low",
		complex: "high",
		"quality-critical": "high",
	},
	// off is impossible; pick cheap levels unless the task really needs depth
	"gateway-forced": {
		mechanical: "low",
		general: "low",
		complex: "high",
		"quality-critical": "high",
	},
	// conservative defaults; orchestrator should probe once before relying on them
	unknown: {
		mechanical: "off",
		general: "low",
		complex: "medium",
		"quality-critical": "high",
	},
};

export function resolveThinkingModelClass(
	model: string,
	classes?: Record<string, ThinkingClassEntry>,
): {
	modelClass: ThinkingModelClass;
	reason: string;
	matched: string;
	source: "provider" | "table" | "family" | "none";
} {
	const parts = model.split("/");
	const provider = parts.length > 1 ? parts[0] : undefined;
	const bare = parts.length > 1 ? parts.slice(1).join("/") : parts[0];
	for (const rule of THINKING_PROVIDER_RULES) {
		if (provider && rule.providerPattern?.test(provider)) {
			return {
				modelClass: rule.modelClass,
				reason: rule.reason,
				matched: `provider:${provider}`,
				source: "provider",
			};
		}
	}
	const bareLower = bare.toLowerCase();
	if (classes) {
		for (const [key, entry] of Object.entries(classes)) {
			const keyLower = key.toLowerCase();
			if (bareLower === keyLower || bareLower.startsWith(keyLower + "-")) {
				return {
					modelClass: entry.class,
					reason: entry.evidence || `recorded capability for ${key}`,
					matched: key,
					source: "table",
				};
			}
		}
	}
	for (const rule of THINKING_MODEL_RULES) {
		if (rule.pattern?.test(bareLower)) {
			return {
				modelClass: rule.modelClass,
				reason: rule.reason,
				matched: bare,
				source: "family",
			};
		}
	}
	return {
		modelClass: "unknown",
		reason: "unrecognized model; probe once to verify thinking behavior before relying on it",
		matched: bare,
		source: "none",
	};
}

export interface ThinkingAdvice {
	model: string; // as given
	bareModel: string;
	modelClass: ThinkingModelClass;
	difficulty: ThinkingDifficulty;
	thinkingLevel: string;
	agentArgs: string[]; // ["--model", <model>, "--thinking", <level>]
	notes: string[];
}

export function computeThinkingAgentArgs(
	model: string,
	difficulty: ThinkingDifficulty,
	opts: { needsArithmetic?: boolean; classes?: Record<string, ThinkingClassEntry> } = {},
): ThinkingAdvice {
	const { modelClass, reason, source } = resolveThinkingModelClass(
		model,
		opts.classes,
	);
	const notes: string[] = [
		`modelClass=${modelClass}; ${reason}`,
		...(source === "table" ? ["class from capability table (recorded evidence)"] : []),
	];
	let thinkingLevel = THINKING_LEVELS_BY_CLASS[modelClass][difficulty];
	if (modelClass === "on-off" && thinkingLevel !== "off" && thinkingLevel !== "low") {
		notes.push("for this class, minimal~high all mean thinking on (depth params are inert)");
	}
	if (modelClass === "on-off" && difficulty === "mechanical" && opts.needsArithmetic) {
		thinkingLevel = "low";
		notes.push("arithmetic-sensitive task: off risks miscalculation, upgraded to on (low)");
	}
	if (modelClass === "gateway-forced") {
		if (thinkingLevel === "off") thinkingLevel = "low";
		notes.push("this gateway cannot disable thinking; off is unavailable, closest level used");
	}
	if (modelClass === "unknown" && difficulty !== "mechanical") {
		notes.push("unrecognized model: probe once and adjust level if needed");
	}
	return {
		model,
		bareModel: model.split("/").slice(-1)[0],
		modelClass,
		difficulty,
		thinkingLevel,
		agentArgs: ["--model", model, "--thinking", thinkingLevel],
		notes,
	};
}

export interface ThinkingClassEntry {
	class: ThinkingModelClass;
	evidence?: string;
}
export interface ThinkingClassesFile {
	version: number;
	entries: Record<string, ThinkingClassEntry>;
}

/** Default capability-table path: <repo>/agents/thinking-classes.json. */
export const DEFAULT_THINKING_CLASSES_PATH = join(extensionDir, "..", "agents", "thinking-classes.json");

export function thinkingClassesPath(): string {
	return process.env.PI_THINKING_CLASSES || DEFAULT_THINKING_CLASSES_PATH;
}

export function loadThinkingClasses(path: string): Record<string, ThinkingClassEntry> {
	try {
		if (!existsSync(path)) return {};
		const parsed = JSON.parse(readFileSync(path, "utf8")) as ThinkingClassesFile;
		return parsed.entries ?? {};
	} catch {
		return {};
	}
}

export function saveThinkingClass(
	path: string,
	model: string,
	modelClass: ThinkingModelClass,
	evidence?: string,
): { entries: Record<string, ThinkingClassEntry>; path: string } {
	const entries = loadThinkingClasses(path);
	entries[model] = { class: modelClass, ...(evidence ? { evidence } : {}) };
	const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
	const data: ThinkingClassesFile = { version: 1, entries: sorted };
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
	return { entries: sorted, path };
}

export default function (pi: ExtensionAPI) {
	if (process.env.HERDR_ENV !== "1" || !process.env.HERDR_PANE_ID) return;

	// Make this repo's SKILL.md (strategy layer) discoverable as a skill.
	pi.on("resources_discover", () => {
		return {
			skillPaths: [skillPath],
		};
	});

	const profileManager = createProfileManager(profileManagerDir);

	async function execHerdr(args: string[], signal?: AbortSignal) {
		const result = await pi.exec("herdr", args, { signal });
		if (signal?.aborted || result.killed) throw new Error("Aborted");
		if (result.code !== 0) {
			const message =
				parseHerdrError(result.stderr) ||
				parseHerdrError(result.stdout) ||
				`herdr ${args.join(" ")} failed with exit code ${result.code}`;
			throw new Error(message);
		}
		return result;
	}

	async function execHerdrJson<T>(args: string[], signal?: AbortSignal): Promise<T> {
		const result = await execHerdr(args, signal);
		const stdout = result.stdout.trim();
		if (!stdout) throw new Error(`Expected JSON output from herdr ${args.join(" ")}`);
		let value: HerdrJsonEnvelope;
		try {
			value = JSON.parse(stdout) as HerdrJsonEnvelope;
		} catch {
			throw new Error(`Failed to parse JSON from herdr ${args.join(" ")}`);
		}
		if (value.error) throw new Error(value.error.message || value.error.code || `herdr ${args.join(" ")} failed`);
		return value as T;
	}

	async function execHerdrText(args: string[], signal?: AbortSignal): Promise<string> {
		return (await execHerdr(args, signal)).stdout;
	}

	async function getCurrentPane(signal?: AbortSignal): Promise<PaneInfo> {
		const response = await execHerdrJson<{ result: { pane: PaneInfo } }>(["pane", "current", "--current"], signal);
		return response.result.pane;
	}

	async function getPane(paneId: string, signal?: AbortSignal): Promise<PaneInfo> {
		const response = await execHerdrJson<{ result: { pane: PaneInfo } }>(["pane", "get", paneId], signal);
		return response.result.pane;
	}

	async function getPaneLayout(paneId: string, signal?: AbortSignal): Promise<PaneLayoutSnapshot> {
		const response = await execHerdrJson<{ result: { layout: PaneLayoutSnapshot } }>(
			["pane", "layout", "--pane", paneId],
			signal,
		);
		return response.result.layout;
	}

	pi.registerTool({
		name: "herdr_layout",
		label: "Herdr Layout",
		description:
			"Create and inspect Herdr terminal topology. Workspaces contain tabs; tabs contain panes. Creating a workspace or tab also creates a root pane, while splitting creates another pane. Layout actions never start an agent or ordinary command. Read pane IDs from results and pass them to herdr_pane or herdr_agent. Creation defaults to the caller's cwd and preserves UI focus. pane_split defaults to the caller's pane and chooses right or down from its geometry. For equal division of the right column, pass ratio = 1/(N-k+1) on the k-th down split (e.g. 3 workers: first down 1/3, then 1/2).",
		promptSnippet: "Inspect or create Herdr workspaces, tabs, and pane topology",
		promptGuidelines: [
			"Follow the herdr-with-pi skill (strategy layer) for when and how to delegate. It may suggest using these tools proactively when a task splits into independent subtasks, needs parallel exploration, or benefits from context isolation — but only act after the user agrees.",
			"Use herdr_layout to create terminal topology before starting a process or agent. Default to a sibling pane in the caller's current tab and cwd; create a tab or workspace only when requested.",
			"Read opaque workspace, tab, and pane IDs from herdr_layout results instead of constructing them, and preserve UI focus unless the user asks to switch context.",
		],
		parameters: Type.Object({
			action: StringEnum(
				[
					"current",
					"workspace_list",
					"workspace_create",
					"workspace_focus",
					"tab_list",
					"tab_create",
					"tab_focus",
					"pane_list",
					"pane_layout",
					"pane_split",
				] as const,
				{ description: "Layout action" },
			),
			workspace: Type.Optional(Type.String({ description: "Opaque workspace ID" })),
			tab: Type.Optional(Type.String({ description: "Opaque tab ID" })),
			pane: Type.Optional(
				Type.String({ description: "Opaque source pane ID. Omit for current, pane_layout, or pane_split to use the caller's pane." }),
			),
			label: Type.Optional(Type.String({ description: "Label for a new workspace or tab" })),
			direction: Type.Optional(DirectionEnum),
			ratio: Type.Optional(
				Type.Number({ description: "Fraction of the source pane's area kept by the source pane after splitting (0 < ratio < 1). Defaults to 0.5 (even split). Passed through to `herdr pane split --ratio`. Use 1/(N-k+1) on the k-th down split to divide the right column into N equal rows." }),
			),
			cwd: Type.Optional(Type.String({ description: "Working directory. Defaults to the caller pane's foreground cwd." })),
			focus: Type.Optional(Type.Boolean({ description: "Change UI focus after creation. Defaults to false." })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			switch (params.action) {
				case "current": {
					const pane = await getCurrentPane(signal);
					return {
						content: [{ type: "text", text: summarizePane(pane, pane.pane_id) }],
						details: { action: "current", pane },
					};
				}
				case "workspace_list": {
					const response = await execHerdrJson<{ result: { workspaces: WorkspaceInfo[] } }>(
						["workspace", "list"],
						signal,
					);
					const workspaces = response.result.workspaces || [];
					return {
						content: [{ type: "text", text: workspaces.length ? workspaces.map(summarizeWorkspace).join("\n") : "No workspaces." }],
						details: { action: "workspace_list", workspaces },
					};
				}
				case "workspace_create": {
					const current = await getCurrentPane(signal);
					const args = ["workspace", "create", "--cwd", params.cwd || current.foreground_cwd || current.cwd || process.cwd()];
					if (params.label) args.push("--label", params.label);
					args.push(params.focus === true ? "--focus" : "--no-focus");
					const response = await execHerdrJson<{
						result: { workspace: WorkspaceInfo; tab: TabInfo; root_pane: PaneInfo };
					}>(args, signal);
					const { workspace, tab, root_pane: rootPane } = response.result;
					return {
						content: [{ type: "text", text: `Created workspace ${workspace.workspace_id}, tab ${tab.tab_id}, root pane ${rootPane.pane_id}` }],
						details: { action: "workspace_create", workspace, tab, pane: rootPane },
					};
				}
				case "workspace_focus": {
					if (!params.workspace) throw new Error("'workspace' is required for workspace_focus");
					const response = await execHerdrJson<{ result: { workspace: WorkspaceInfo } }>(
						["workspace", "focus", params.workspace],
						signal,
					);
					return {
						content: [{ type: "text", text: `Focused workspace ${response.result.workspace.workspace_id}` }],
						details: { action: "workspace_focus", workspace: response.result.workspace },
					};
				}
				case "tab_list": {
					const args = ["tab", "list"];
					if (params.workspace) args.push("--workspace", params.workspace);
					const response = await execHerdrJson<{ result: { tabs: TabInfo[] } }>(args, signal);
					const tabs = response.result.tabs || [];
					return {
						content: [{ type: "text", text: tabs.length ? tabs.map(summarizeTab).join("\n") : "No tabs." }],
						details: { action: "tab_list", tabs },
					};
				}
				case "tab_create": {
					const current = await getCurrentPane(signal);
					const args = ["tab", "create", "--workspace", params.workspace || current.workspace_id];
					args.push("--cwd", params.cwd || current.foreground_cwd || current.cwd || process.cwd());
					if (params.label) args.push("--label", params.label);
					args.push(params.focus === true ? "--focus" : "--no-focus");
					const response = await execHerdrJson<{ result: { tab: TabInfo; root_pane: PaneInfo } }>(args, signal);
					const { tab, root_pane: rootPane } = response.result;
					return {
						content: [{ type: "text", text: `Created tab ${tab.tab_id}, root pane ${rootPane.pane_id}` }],
						details: { action: "tab_create", tab, pane: rootPane },
					};
				}
				case "tab_focus": {
					if (!params.tab) throw new Error("'tab' is required for tab_focus");
					const response = await execHerdrJson<{ result: { tab: TabInfo } }>(["tab", "focus", params.tab], signal);
					return {
						content: [{ type: "text", text: `Focused tab ${response.result.tab.tab_id}` }],
						details: { action: "tab_focus", tab: response.result.tab },
					};
				}
				case "pane_list": {
					const current = await getCurrentPane(signal);
					const workspaceId = params.workspace || current.workspace_id;
					const response = await execHerdrJson<{ result: { panes: PaneInfo[] } }>(
						["pane", "list", "--workspace", workspaceId],
						signal,
					);
					const panes = response.result.panes || [];
					return {
						content: [{ type: "text", text: panes.length ? panes.map((pane) => summarizePane(pane, current.pane_id)).join("\n") : "No panes." }],
						details: { action: "pane_list", panes, workspaceId },
					};
				}
				case "pane_layout": {
					const paneId = params.pane || (await getCurrentPane(signal)).pane_id;
					const layout = await getPaneLayout(paneId, signal);
					return {
						content: [{ type: "text", text: JSON.stringify(layout, null, 2) }],
						details: { action: "pane_layout", layout },
					};
				}
				case "pane_split": {
					if (params.ratio != null && (params.ratio <= 0 || params.ratio >= 1)) {
						throw new Error(`ratio must be between 0 and 1, got ${params.ratio}`);
					}
					const current = await getCurrentPane(signal);
					const source = params.pane ? await getPane(params.pane, signal) : current;
					const direction = params.direction || chooseSplitDirection(await getPaneLayout(source.pane_id, signal), source.pane_id);
					const cwd = params.cwd || source.foreground_cwd || source.cwd || current.foreground_cwd || current.cwd || process.cwd();
					const args = ["pane", "split", source.pane_id, "--direction", direction, "--cwd", cwd];
					if (params.ratio != null) args.push("--ratio", String(params.ratio));
					args.push(params.focus === true ? "--focus" : "--no-focus");
					const response = await execHerdrJson<{ result: { pane: PaneInfo } }>(args, signal);
					const pane = response.result.pane;
					return {
						content: [{ type: "text", text: `Created pane ${pane.pane_id} by splitting ${source.pane_id} ${direction}` }],
						details: { action: "pane_split", pane, sourcePaneId: source.pane_id, direction },
					};
				}
			}
		},
		renderCall(args, theme, context) {
			return renderToolCall("herdr_layout", args, theme, context);
		},
		renderResult(result, options, theme) {
			return renderToolResult(result, options, theme);
		},
	});

	pi.registerTool({
		name: "herdr_pane",
		label: "Herdr Pane",
		description:
			"Control a raw Herdr terminal pane. Use for shells, tests, servers, builds, logs, and other ordinary processes: run a command, read output, wait for matching output, send literal text or terminal keys, inspect, or close. Pane actions target opaque pane IDs and do not validate agent identity or interpret agent lifecycle. Use herdr_agent instead when controlling a recognized coding agent. Read output is truncated to 2000 lines or 50KB.",
		promptSnippet: "Run and inspect ordinary commands in Herdr terminal panes",
		promptGuidelines: [
			"Use herdr_pane for ordinary commands and raw terminal control; use herdr_agent for coding-agent prompts, lifecycle waits, reads, and interactive keys.",
			"Use herdr_pane wait_output for tests, servers, builds, and watchers. It searches existing output immediately; use recent-unwrapped for logs and transcripts.",
			"Do not close a Herdr pane you did not create unless the user explicitly asks. herdr_pane always refuses to close the pane running the current pi process.",
		],
		parameters: Type.Object({
			action: StringEnum(["get", "run", "read", "wait_output", "send_text", "send_keys", "close"] as const, {
				description: "Raw pane action",
			}),
			pane: Type.String({ description: "Opaque pane ID returned by herdr_layout" }),
			command: Type.Optional(Type.String({ description: "Shell command to submit atomically with Enter for run" })),
			text: Type.Optional(Type.String({ description: "Literal text to send without Enter for send_text" })),
			keys: Type.Optional(
				Type.Array(Type.String(), { description: "Logical terminal keys for send_keys, such as esc, enter, up, or ctrl+c" }),
			),
			match: Type.Optional(Type.String({ description: "Literal substring or Rust regular expression for wait_output" })),
			regex: Type.Optional(Type.Boolean({ description: "Treat match as a Rust regular expression" })),
			source: Type.Optional(ReadSourceEnum),
			lines: Type.Optional(Type.Integer({ minimum: 1, description: "Rendered terminal rows to read or search" })),
			format: Type.Optional(OutputFormatEnum),
			raw: Type.Optional(Type.Boolean({ description: "Keep ANSI escapes while matching wait_output" })),
			timeout: Type.Optional(Type.Integer({ minimum: 1, description: "Wait timeout in milliseconds; omitted means indefinite" })),
		}),
		async execute(_toolCallId, params, signal, onUpdate, _ctx) {
			switch (params.action) {
				case "get": {
					const pane = await getPane(params.pane, signal);
					return {
						content: [{ type: "text", text: summarizePane(pane) }],
						details: { action: "get", pane },
					};
				}
				case "run": {
					if (!params.command) throw new Error("'command' is required for run");
					// herdr pane run does NOT emit a JSON envelope (stdout is empty, exit code only),
					// so it must not go through execHerdrJson.
					await execHerdr(["pane", "run", params.pane, params.command], signal);
					return {
						content: [{ type: "text", text: `Submitted command to pane ${params.pane}` }],
						details: { action: "run", pane: params.pane, command: params.command },
					};
				}
				case "read": {
					const args = ["pane", "read", params.pane, "--source", params.source || "recent-unwrapped"];
					if (params.lines != null) args.push("--lines", String(params.lines));
					if (params.format) args.push("--format", params.format);
					const output = await execHerdrText(args, signal);
					return {
						content: [{ type: "text", text: formatOutput(output) }],
						details: { action: "read", pane: params.pane, read: true, source: params.source || "recent-unwrapped" },
					};
				}
				case "wait_output": {
					if (!params.match) throw new Error("'match' is required for wait_output");
					if (params.source === "detection") throw new Error("wait_output does not support the detection source; use read");
					const startedAt = Date.now();
					onUpdate?.({
						content: [{ type: "text", text: `Waiting for output in ${params.pane}...` }],
						details: { action: "wait_output", pane: params.pane, waiting: true },
					});
					const args = ["pane", "wait-output", params.pane, params.regex ? "--regex" : "--match", params.match];
					if (params.source) args.push("--source", params.source as WaitOutputSource);
					if (params.lines != null) args.push("--lines", String(params.lines));
					if (params.timeout != null) args.push("--timeout", String(params.timeout));
					if (params.raw) args.push("--raw");
					const response = await execHerdrJson<{
						result: { pane_id: string; matched_line: string; read?: { text?: string } };
					}>(args, signal);
					const matched = response.result;
					const output = matched.read?.text || matched.matched_line;
					return {
						content: [{ type: "text", text: `Matched: ${matched.matched_line}\n\n${formatOutput(output)}` }],
						details: {
							action: "wait_output",
							pane: params.pane,
							matchedLine: matched.matched_line,
							elapsedMs: Date.now() - startedAt,
						},
					};
				}
				case "send_text": {
					if (!params.text) throw new Error("'text' is required for send_text");
					await execHerdrJson(["pane", "send-text", params.pane, params.text], signal);
					return {
						content: [{ type: "text", text: `Sent literal text to pane ${params.pane}` }],
						details: { action: "send_text", pane: params.pane },
					};
				}
				case "send_keys": {
					if (!params.keys?.length) throw new Error("'keys' is required for send_keys");
					await execHerdrJson(["pane", "send-keys", params.pane, ...params.keys], signal);
					return {
						content: [{ type: "text", text: `Sent ${params.keys.join(" ")} to pane ${params.pane}` }],
						details: { action: "send_keys", pane: params.pane, keys: params.keys },
					};
				}
				case "close": {
					const current = await getCurrentPane(signal);
					if (params.pane === current.pane_id) throw new Error("Refusing to close the pane pi is running in.");
					await execHerdrJson(["pane", "close", params.pane], signal);
					return {
						content: [{ type: "text", text: `Closed pane ${params.pane}` }],
						details: { action: "close", pane: params.pane },
					};
				}
			}
		},
		renderCall(args, theme, context) {
			return renderToolCall("herdr_pane", args, theme, context);
		},
		renderResult(result, options, theme) {
			return renderToolResult(result, options, theme);
		},
	});

	pi.registerTool({
		name: "herdr_agent",
		label: "Herdr Agent",
		description:
			"Control a recognized coding agent occupying an existing Herdr pane. Starting requires an available interactive shell pane created through herdr_layout and never creates or changes layout. Agent targets are unique live names or the pane ID currently hosting the agent, never terminal IDs or bare kind labels. Use prompt, wait, read, and send_keys instead of raw pane input. Lifecycle states are working, blocked, done, idle, and unknown; prompt and wait default to the first settled idle, done, or blocked state. Read output is truncated to 2000 lines or 50KB.",
		promptSnippet: "Start, prompt, wait for, read, and interact with coding agents in Herdr",
		promptGuidelines: [
			"Use herdr_agent for recognized coding agents. Use herdr_layout to create an available shell pane first; herdr_agent start never creates or moves terminal layout.",
			"For normal helper work, use herdr_layout pane_split, then herdr_agent start, herdr_agent prompt with wait enabled, and herdr_agent read. Use herdr_pane only for ordinary processes or intentional raw terminal control.",
			"Treat herdr_agent idle and done as ready states, blocked as requiring inspection or input, and unknown as uncertain rather than completed. CLI reads do not mark done work as seen.",
			"If herdr_agent read cannot recover a full alternate-screen response after increasing lines, ask the agent to write its complete response to a temporary Markdown file and return the path, then read that file directly.",
		],
		parameters: Type.Object({
			action: StringEnum(["list", "get", "start", "prompt", "wait", "read", "send_keys", "focus", "rename"] as const, {
				description: "Agent lifecycle action",
			}),
			target: Type.Optional(Type.String({ description: "Unique live agent name or pane ID currently hosting the agent" })),
			pane: Type.Optional(Type.String({ description: "Existing available shell pane ID for start" })),
			name: Type.Optional(
				Type.String({
					pattern: "^[a-z][a-z0-9_-]{0,31}$",
					description: "Unique agent name for start or replacement name for rename",
				}),
			),
			kind: Type.Optional(AgentKindEnum),
			agentArgs: Type.Optional(Type.Array(Type.String(), { description: "Native agent arguments passed unchanged after -- for start" })),
			prompt: Type.Optional(Type.String({ description: "Prompt text submitted atomically with Enter" })),
			wait: Type.Optional(Type.Boolean({ description: "Wait for lifecycle settlement after prompt. Defaults to true." })),
			until: Type.Optional(Type.Array(StatusEnum, { description: "Accepted lifecycle states for prompt with wait or wait; defaults to idle, done, or blocked" })),
			timeout: Type.Optional(Type.Integer({ minimum: 1, description: "Timeout in milliseconds; omitted means indefinite" })),
			source: Type.Optional(ReadSourceEnum),
			lines: Type.Optional(Type.Integer({ minimum: 1, description: "Rendered terminal rows to read" })),
			format: Type.Optional(OutputFormatEnum),
			keys: Type.Optional(Type.Array(Type.String(), { description: "Logical UI keys such as esc, enter, up, or ctrl+c" })),
			clearName: Type.Optional(Type.Boolean({ description: "Clear the current agent name for rename" })),
		}),
		async execute(_toolCallId, params, signal, onUpdate, _ctx) {
			switch (params.action) {
				case "list": {
					const response = await execHerdrJson<{ result: { agents: AgentInfo[] } }>(["agent", "list"], signal);
					const agents = response.result.agents || [];
					return {
						content: [{ type: "text", text: agents.length ? agents.map(summarizeAgent).join("\n") : "No agents." }],
						details: { action: "list", agents },
					};
				}
				case "get": {
					if (!params.target) throw new Error("'target' is required for get");
					const response = await execHerdrJson<{ result: { agent: AgentInfo } }>(["agent", "get", params.target], signal);
					return {
						content: [{ type: "text", text: summarizeAgent(response.result.agent) }],
						details: { action: "get", agent: response.result.agent },
					};
				}
				case "start": {
					if (!params.name) throw new Error("'name' is required for start");
					if (!params.kind) throw new Error("'kind' is required for start");
					if (!params.pane) throw new Error("'pane' is required for start");
					if (params.timeout != null && (params.timeout <= 3000 || params.timeout > 300000)) {
						throw new Error("start timeout must be greater than 3000ms and at most 300000ms");
					}
					const args = ["agent", "start", params.name, "--kind", params.kind, "--pane", params.pane];
					if (params.timeout != null) args.push("--timeout", String(params.timeout));
					if (params.agentArgs?.length) args.push("--", ...params.agentArgs);
					onUpdate?.({
						content: [{ type: "text", text: `Starting ${params.kind} as ${params.name} in ${params.pane}...` }],
						details: { action: "start", waiting: true },
					});
					const response = await execHerdrJson<{ result: { agent: AgentInfo } }>(args, signal);
					return {
						content: [{ type: "text", text: `Started ${summarizeAgent(response.result.agent)}` }],
						details: { action: "start", agent: response.result.agent },
					};
				}
				case "prompt": {
					if (!params.target) throw new Error("'target' is required for prompt");
					if (!params.prompt) throw new Error("'prompt' is required for prompt");
					const shouldWait = params.wait !== false;
					if (!shouldWait && params.until?.length) throw new Error("'until' requires wait for prompt");
					if (!shouldWait && params.timeout != null) throw new Error("'timeout' requires wait for prompt");
					const args = ["agent", "prompt", params.target, params.prompt];
					if (shouldWait) args.push("--wait");
					for (const status of params.until || []) args.push("--until", status);
					if (params.timeout != null) args.push("--timeout", String(params.timeout));
					if (shouldWait) {
						onUpdate?.({
							content: [{ type: "text", text: `Prompted ${params.target}; waiting for lifecycle settlement...` }],
							details: { action: "prompt", target: params.target, waiting: true },
						});
					}
					const response = await execHerdrJson<{ result: { agent: AgentInfo } }>(args, signal);
					return {
						content: [{ type: "text", text: `${shouldWait ? "Prompt settled" : "Prompt submitted"}: ${summarizeAgent(response.result.agent)}` }],
						details: { action: "prompt", agent: response.result.agent },
					};
				}
				case "wait": {
					if (!params.target) throw new Error("'target' is required for wait");
					const args = ["agent", "wait", params.target];
					for (const status of params.until || []) args.push("--until", status);
					if (params.timeout != null) args.push("--timeout", String(params.timeout));
					onUpdate?.({
						content: [{ type: "text", text: `Waiting for agent ${params.target}...` }],
						details: { action: "wait", target: params.target, waiting: true },
					});
					const response = await execHerdrJson<{ result: { agent: AgentInfo } }>(args, signal);
					return {
						content: [{ type: "text", text: `Agent settled: ${summarizeAgent(response.result.agent)}` }],
						details: { action: "wait", agent: response.result.agent },
					};
				}
				case "read": {
					if (!params.target) throw new Error("'target' is required for read");
					const args = ["agent", "read", params.target, "--source", params.source || "recent-unwrapped"];
					if (params.lines != null) args.push("--lines", String(params.lines));
					if (params.format) args.push("--format", params.format as OutputFormat);
					const output = await execHerdrText(args, signal);
					return {
						content: [{ type: "text", text: formatOutput(output) }],
						details: { action: "read", target: params.target, read: true, source: params.source || "recent-unwrapped" },
					};
				}
				case "send_keys": {
					if (!params.target) throw new Error("'target' is required for send_keys");
					if (!params.keys?.length) throw new Error("'keys' is required for send_keys");
					await execHerdrJson(["agent", "send-keys", params.target, ...params.keys], signal);
					return {
						content: [{ type: "text", text: `Sent ${params.keys.join(" ")} to ${params.target}` }],
						details: { action: "send_keys", target: params.target, keys: params.keys },
					};
				}
				case "focus": {
					if (!params.target) throw new Error("'target' is required for focus");
					const response = await execHerdrJson<{ result: { agent: AgentInfo } }>(["agent", "focus", params.target], signal);
					return {
						content: [{ type: "text", text: `Focused ${agentDisplayName(response.result.agent)}` }],
						details: { action: "focus", agent: response.result.agent },
					};
				}
				case "rename": {
					if (!params.target) throw new Error("'target' is required for rename");
					if (!params.clearName && !params.name) throw new Error("'name' or 'clearName' is required for rename");
					const args = ["agent", "rename", params.target];
					args.push(params.clearName ? "--clear" : params.name!);
					const response = await execHerdrJson<{ result: { agent: AgentInfo } }>(args, signal);
					return {
						content: [{ type: "text", text: params.clearName ? `Cleared agent name for ${params.target}` : `Renamed agent to ${params.name}` }],
						details: { action: "rename", agent: response.result.agent },
					};
				}
			}
		},
		renderCall(args, theme, context) {
			return renderToolCall("herdr_agent", args, theme, context);
		},
		renderResult(result, options, theme) {
			return renderToolResult(result, options, theme);
		},
	});

	pi.registerTool({
		name: "herdr_profile",
		label: "Herdr Profile",
		description:
			"Manage subagent profiles in this repo's agents/ directory. Profiles are versioned assets (YAML frontmatter + system-prompt body) used to spawn subagents: the frontmatter pins the targeted built-in tool allow-list (tools) and the body is the targeted system prompt, so a spawned subagent only gets what its task needs — no extra context. Pi packages are NOT pinned in profiles: the main agent picks them dynamically per task via herdr_package (the package folder changes often). Before starting a subagent, always call herdr_profile list first: if a profile is *exactly* fit for the task — domain and language match the description, the responsibility matches, and its tools cover what the task needs — reuse it (read it and use its body as the prompt). If no existing profile is exactly fit (any noticeable gap, e.g. an R-expert profile for a C# task), create a new one with create and use that profile for the spawn. Never repurpose a profile that is merely close.",
		promptSnippet: "List, read, and create subagent profiles in agents/",
		promptGuidelines: [
			"Before spawning a subagent, check agents/ via herdr_profile list; a profile counts as fit only when it is exactly fit (domain, language, responsibility, and tool needs all match). If exactly fit, read it and spawn from it.",
			"If no profile is exactly fit, create a new one with herdr_profile create: name is a short lowercase id, description states precisely when the profile applies, tools lists the comma-separated built-in tool allow-list, body is the system prompt including the output contract. Keep tools minimal — the subagent should only carry what its task needs. Only then start the subagent from the new profile.",
			"create refuses to overwrite an existing profile — update it instead or pick a distinct name.",
		],
		parameters: Type.Object({
			action: StringEnum(["list", "read", "create"] as const, {
				description: "Profile action",
			}),
			name: Type.Optional(
				Type.String({
					pattern: "^[a-z][a-z0-9_-]{0,31}$",
					description: "Profile name (lowercase id) for read or create",
				}),
			),
			description: Type.Optional(Type.String({ description: "When the profile applies; used as the pi subagent description" })),
			tools: Type.Optional(Type.String({ description: "Comma-separated built-in tool allow-list, e.g. read, bash" })),
			body: Type.Optional(Type.String({ description: "System-prompt body, including the output contract" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			switch (params.action) {
				case "list": {
					const profiles = profileManager.list();
					return {
						content: [
							{
								type: "text",
								text: profiles.length
									? profiles
										.map(
												(profile) =>
													`${profile.name}${profile.version ? ` v${profile.version}` : ""} — ${profile.description || "(no description)"}${profile.tools ? ` [tools: ${profile.tools}]` : ""}`,
										)
									.join("\n")
									: "No profiles in agents/.",
							},
						],
						details: { action: "list", profiles },
					};
				}
				case "read": {
					if (!params.name) throw new Error("'name' is required for read");
					const content = profileManager.read(params.name);
					if (content === null) throw new Error(`profile ${params.name} does not exist`);
					return {
						content: [{ type: "text", text: content }],
						details: { action: "read", name: params.name },
					};
				}
				case "create": {
					if (!params.name) throw new Error("'name' is required for create");
					if (!params.description) throw new Error("'description' is required for create");
					if (!params.tools) throw new Error("'tools' is required for create");
					if (!params.body) throw new Error("'body' is required for create");
					const profile = profileManager.create({
						name: params.name,
						description: params.description,
						tools: params.tools,
						body: params.body,
					});
					return {
						content: [
							{
								type: "text",
								text: `Created profile ${profile.name} v${profile.version} in agents/. Use it to spawn the subagent.`,
							},
						],
						details: { action: "create", profile },
					};
				}
			}
		},
		renderCall(args, theme, context) {
			return renderToolCall("herdr_profile", args, theme, context);
		},
		renderResult(result, options, theme) {
			return renderToolResult(result, options, theme);
		},
	});

	pi.registerTool({
		name: "herdr_package",
		label: "Herdr Package",
		description:
			"Discover and resolve pi packages (extensions/skills) for provisioning subagent tools. Pi packages are picked DYNAMICALLY per task — the package folder ($PI_PACKAGES_DIR) changes often, so packages are never pinned in subagent profiles. list shows the packages under $PI_PACKAGES_DIR (with description/keywords); resolve maps package names to their directories, ready to pass as `-e <dir>` in herdr_agent start agentArgs so a spawned subagent only loads the tools/skills its current task needs. When PI_PACKAGES_DIR is unset, skip tool provisioning entirely and spawn as usual.",
		promptSnippet: "List/resolve pi packages from $PI_PACKAGES_DIR to provision subagent tools",
		promptGuidelines: [
			"Before starting a subagent, when PI_PACKAGES_DIR is set, call herdr_package list to see what pi packages currently exist, then dynamically choose the ones the subagent's task needs (the package folder changes often, so decide per task — never pin package names in profile frontmatter).",
			"Resolve the chosen names with herdr_package resolve and pass each found package as a single-line `-e <dir>` entry in herdr_agent start agentArgs (e.g. [\"-e\", \"/abs/path/to/package\"]); keep agentArgs single-line and shell-safe. Missing packages are reported and skipped — spawn still proceeds.",
			"When PI_PACKAGES_DIR is unset, skip tool provisioning entirely — the profile tools allow-list (-t) still applies.",
		],
		parameters: Type.Object({
			action: StringEnum(["list", "resolve"] as const, {
				description: "Package action",
			}),
			packages: Type.Optional(
				Type.Array(Type.String(), { description: "Package names (from a profile's packages field) to resolve for resolve" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const packagesDir = process.env.PI_PACKAGES_DIR;
			if (!packagesDir) {
				return {
					content: [{ type: "text", text: "PI_PACKAGES_DIR is not set; skipping pi-package provisioning." }],
					details: { action: params.action, envSet: false },
				};
			}
			const scanner = createPackageScanner(packagesDir);
			if (params.action === "resolve") {
				if (!params.packages?.length) throw new Error("'packages' is required for resolve");
				const { found, missing } = scanner.find(params.packages);
				const text = [
					...found.map((pkg) => `-e ${pkg.path}  # ${pkg.name}`),
					...(missing.length ? [`missing: ${missing.join(", ")}`] : []),
				].join("\n");
				return {
					content: [{ type: "text", text: text || "(no packages)" }],
					details: { action: "resolve", envSet: true, packagesDir, found, missing },
				};
			}
			const packages = scanner.list();
			return {
				content: [
					{
						type: "text",
						text: packages.length
							? packages
								.map(
									(pkg) =>
										`${pkg.name} — ${pkg.description || "(no description)"}${pkg.keywords?.length ? ` [${pkg.keywords.join(", ")}]` : ""}`,
								)
								.join("\n")
							: `No pi packages found under ${packagesDir}.`,
					},
				],
				details: { action: "list", envSet: true, packagesDir, packages },
			};
		},
		renderCall(args, theme, context) {
			return renderToolCall("herdr_package", args, theme, context);
		},
		renderResult(result, options, theme) {
			return renderToolResult(result, options, theme);
		},
	});


	pi.registerTool({
		name: "herdr_thinking",
		label: "Herdr Thinking",
		description:
			"Advise or record subagent thinking levels for herdr_agent start. advise: take the model and the task difficulty and return the recommended thinking level plus spawn-ready --model/--thinking agentArgs; the model capability class is resolved from provider/gateway rules first (serving behavior can override model design), then the recorded capability table (agents/thinking-classes.json — gitignored, local-only; format documented by agents/thinking-classes.example.json; path overridable via $PI_THINKING_CLASSES — extendable via record), then public model-design families (deepseek-v4-* -> on/off only, qwen3.5/3.6/3.8 -> thinking-budget ladder). Unknown models get conservative defaults plus a note to probe once. record: persist a verified capability class for a model into the capability table (path: $PI_THINKING_CLASSES or <repo>/agents/thinking-classes.json) so later advise calls skip probing. Call right before herdr_agent start, after the model was chosen per the PI_MODEL_* rules in the herdr-with-pi skill.",
		promptSnippet: "Compute --thinking level and --model/--thinking agentArgs for a subagent spawn from model + task difficulty",
		promptGuidelines: [
			"Before spawning a subagent, after choosing the model from PI_MODEL_* env rules, call herdr_thinking with action=advise, the model and the task difficulty tier to get the recommended thinking level and the --model/--thinking agentArgs entries.",
			"Merge the returned agentArgs entries into herdr_agent start agentArgs together with -t (profile tools) and any -e (pi packages) entries; keep all entries single-line and shell-safe.",
			"Read the returned notes: e.g. for on/off-only models minimal~high all mean thinking on; for gateway-forced models off is impossible.",
			"When advise reports an unrecognized model, probe it once (a one-shot call with --thinking off; check whether reasoning content still appears in the session transcript) and persist the verified class with action=record so later spawns skip probing. Record with the bare model id only — provider/gateway prefixes are stripped and must not be persisted.",
			"Read the returned notes: e.g. for on/off-only models minimal~high all mean thinking on; for gateway-forced models off is impossible.",
		],
		parameters: Type.Object({
			action: StringEnum(["advise", "record"] as const, {
				description: "advise = recommend thinking level + agentArgs for a spawn; record = persist a verified capability class",
			}),
			model: Type.String({
				description:
					"Target model: full `provider/model` or bare model id. For record, only the bare model id is stored (provider/gateway prefix is stripped).",
			}),
			difficulty: Type.Optional(
				StringEnum(
					["mechanical", "general", "complex", "quality-critical"] as const,
					{ description: "Task difficulty tier (required for advise; see the herdr-with-pi skill decision table)" },
				),
			),
			needsArithmetic: Type.Optional(
				Type.Boolean({
					description:
						"Task involves precise arithmetic (probabilities, calculations). Only meaningful for on/off-only models at mechanical difficulty (off risks miscalculation).",
				}),
			),
			class: Type.Optional(
				StringEnum(
					["budget-ladder", "on-off", "gateway-forced", "unknown"] as const,
					{ description: "Verified capability class (required for record)" },
				),
			),
			evidence: Type.Optional(
				Type.String({
					description: "How the class was verified (required for record; keep it generic, no machine-specific info)",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			if (params.action === "record") {
				if (!params.class) throw new Error("'class' is required for record");
				// table entries are keyed by bare model id; strip any provider/gateway prefix
				// so machine-specific gateway names never persist into the repo asset
				const bareModel = params.model.split("/").slice(-1)[0];
				const { entries, path } = saveThinkingClass(
					thinkingClassesPath(),
					bareModel,
					params.class,
					params.evidence,
				);
				return {
					content: [
						{
							type: "text",
							text: `recorded ${params.model} -> ${params.class} in ${path}\nentries: ${Object.keys(entries).join(", ")}`,
						},
					],
					details: { action: "record", path, model: params.model, modelClass: params.class, entries },
				};
			}
			if (!params.difficulty) throw new Error("'difficulty' is required for advise");
			const classes = loadThinkingClasses(thinkingClassesPath());
			const advice = computeThinkingAgentArgs(params.model, params.difficulty, {
				needsArithmetic: params.needsArithmetic ?? false,
				classes,
			});
			const text = [
				`model: ${advice.model}`,
				`bareModel: ${advice.bareModel}`,
				`modelClass: ${advice.modelClass}`,
				`difficulty: ${advice.difficulty}`,
				`thinkingLevel: ${advice.thinkingLevel}`,
				`agentArgs: ${advice.agentArgs.map((a) => JSON.stringify(a)).join(" ")}`,
				...(advice.modelClass === "unknown"
					? [
							"probe: run one shot with --thinking off and check whether reasoning content still appears in the session transcript; then herdr_thinking action=record to persist the verified class.",
					  ]
					: []),
				...(advice.notes.length ? [`notes:`, ...advice.notes.map((n) => `  - ${n}`)] : []),
			].join("\n");
			return {
				content: [{ type: "text", text }],
				details: advice,
			};
		},
		renderCall(args, theme, context) {
			return renderToolCall("herdr_thinking", args, theme, context);
		},
		renderResult(result, options, theme) {
			return renderToolResult(result, options, theme);
		},
	});
}
