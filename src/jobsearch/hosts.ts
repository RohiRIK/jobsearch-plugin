/**
 * Install the plugin on agent hosts — one tested implementation replacing the
 * per-host shell installers. Host formats: docs/planning/host-contracts.md.
 *
 * Every install is computed as a list of changes first. Conflicts (a skill,
 * link or MCP entry with our name that we did not create) abort before any
 * write with exit 5. --dry-run returns the list (exit 10); --yes applies it.
 * Uninstall removes only what points back at this plugin.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CODE_ROOT, isCheckout } from "../paths.js";
import { resolveBin } from "../resolve-bin.js";
import { AgentError, EXIT, confirmWrite, str, type CommandResult, type CommandSpec, type Values } from "./contract.js";

export const HOSTS = ["claude", "hermes", "opencode", "openclaw", "pi", "mcp"] as const;
export type Host = (typeof HOSTS)[number];
const MARKETPLACE = "rohirik";
const GITHUB_REPO = "RohiRIK/jobsearch-plugin";

export function pluginDir(root: string = CODE_ROOT): string {
  return existsSync(join(root, ".claude-plugin", "plugin.json")) ? root : join(root, "job-search");
}
export function launcher(root: string = CODE_ROOT): string {
  return join(pluginDir(root), "scripts", "jobsearch");
}
function home(): string {
  const h = process.env.HOME;
  if (!h) throw new AgentError("unavailable", "HOME is not set");
  return h;
}
export function pluginSkills(root: string = CODE_ROOT): string[] {
  const dir = join(pluginDir(root), "skills");
  return readdirSync(dir).filter((d) => existsSync(join(dir, d, "SKILL.md"))).sort();
}

export type Change =
  | { action: "link"; path: string; target: string }
  | { action: "unlink"; path: string }
  | { action: "write"; path: string; reason: string; content: string }
  | { action: "run"; command: string[] };

const isLink = (p: string) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};
const exists = (p: string) => existsSync(p) || isLink(p);
/** Our link: a symlink whose target lives inside this plugin directory. */
const ours = (p: string) => isLink(p) && resolve(dirname(p), readlinkSync(p)).startsWith(pluginDir());

function linkPlan(changes: Change[], conflicts: string[], path: string, target: string): void {
  if (!exists(path)) changes.push({ action: "link", path, target });
  else if (isLink(path) && resolve(dirname(path), readlinkSync(path)) === target) return; // already installed
  else if (ours(path)) changes.push({ action: "unlink", path }, { action: "link", path, target });
  else conflicts.push(path);
}

function shimPlan(changes: Change[], conflicts: string[]): void {
  linkPlan(changes, conflicts, join(home(), ".local", "bin", "jobsearch"), launcher());
}

function hermesRoot(scope: string | undefined): string {
  if (scope?.startsWith("profile:")) {
    const name = scope.slice("profile:".length);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) throw new AgentError("validation", `invalid Hermes profile name: ${JSON.stringify(name)}`);
    return join(home(), ".hermes", "profiles", name);
  }
  return join(home(), ".hermes");
}

/** Insert our MCP entry into Hermes config.yaml without creating a duplicate `mcp_servers:` key. */
/**
 * Our entry is recognised by its parsed value, never its spelling: `hermes config set`
 * writes the command unquoted and args as a block list, which is the same registration.
 * Appending still edits text, so the rest of the file keeps its comments and layout.
 */
export function hermesConfigWithMcp(current: string, command: string): string | "present" | "conflict" {
  let doc: unknown;
  try {
    doc = current.trim() === "" ? {} : Bun.YAML.parse(current);
  } catch {
    throw new AgentError("validation", "cannot parse the Hermes config.yaml; fix it by hand first");
  }
  const servers = (doc as { mcp_servers?: unknown } | null)?.mcp_servers;
  const existing = servers && typeof servers === "object" ? (servers as Record<string, unknown>)["job-search"] : undefined;
  if (existing !== undefined) {
    const { command: cmd, args } = (existing ?? {}) as { command?: unknown; args?: unknown };
    return cmd === command && Array.isArray(args) && args.length === 1 && args[0] === "mcp" ? "present" : "conflict";
  }
  const entry = `  job-search:\n    command: ${JSON.stringify(command)}\n    args: ["mcp"]\n`;
  if (/^mcp_servers:\s*$/m.test(current)) return current.replace(/^mcp_servers:\s*$/m, (m) => `${m}\n${entry.trimEnd()}`);
  // An inline or null `mcp_servers:` cannot take a block entry; a second key would shadow the first.
  if (/^mcp_servers:/m.test(current)) throw new AgentError("validation", "mcp_servers in the Hermes config.yaml is not a block mapping; add the job-search entry by hand");
  return `${current}${current.endsWith("\n") || current === "" ? "" : "\n"}mcp_servers:\n${entry}`;
}

function readJson(path: string): Record<string, any> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    throw new AgentError("validation", `cannot parse ${path}; fix it by hand first`);
  }
}

export function planInstall(host: Host, scope: string | undefined): { changes: Change[]; conflicts: string[]; notes: string[] } {
  const changes: Change[] = [];
  const conflicts: string[] = [];
  const notes: string[] = [];
  const skills = pluginSkills();
  const cmd = launcher();
  switch (host) {
    case "claude": {
      const claude = resolveBin("claude");
      const source = isCheckout(dirname(pluginDir())) ? dirname(pluginDir()) : GITHUB_REPO;
      const scopeArgs = scope === "project" ? ["--scope", "project"] : [];
      if (!claude) {
        notes.push("claude CLI not found; inside Claude Code run: /plugin marketplace add " + source + " then /plugin install job-search@" + MARKETPLACE);
        break;
      }
      changes.push({ action: "run", command: [claude, "plugin", "marketplace", "add", source, ...scopeArgs] });
      changes.push({ action: "run", command: [claude, "plugin", "install", `job-search@${MARKETPLACE}`, ...scopeArgs] });
      break;
    }
    case "hermes": {
      const root = hermesRoot(scope);
      if (!existsSync(root)) throw new AgentError("not_found", `Hermes ${scope ?? "global"} root not found: ${root}`, ["hermes profile list", "install Hermes first"]);
      for (const s of skills) linkPlan(changes, conflicts, join(root, "skills", `job-search-${s}`), join(pluginDir(), "skills", s));
      const config = join(root, "config.yaml");
      const current = existsSync(config) ? readFileSync(config, "utf-8") : "";
      const next = hermesConfigWithMcp(current, cmd);
      if (next === "conflict") conflicts.push(`${config} (mcp_servers.job-search points elsewhere)`);
      else if (next !== "present") changes.push({ action: "write", path: config, reason: "add mcp_servers.job-search", content: next });
      shimPlan(changes, conflicts);
      break;
    }
    case "openclaw": {
      const dir = join(home(), ".openclaw", "workspace", "skills");
      for (const s of skills) linkPlan(changes, conflicts, join(dir, `job-search-${s}`), join(pluginDir(), "skills", s));
      const openclaw = resolveBin("openclaw");
      if (openclaw) changes.push({ action: "run", command: [openclaw, "mcp", "add", "job-search", "--command", cmd, "--arg", "mcp"] });
      else notes.push("openclaw CLI not found: skills will be linked, MCP registration skipped");
      shimPlan(changes, conflicts);
      break;
    }
    case "opencode": {
      const base = join(home(), ".config", "opencode");
      // OpenCode requires a skill's name to equal its directory, so links keep the plain name.
      for (const s of skills) linkPlan(changes, conflicts, join(base, "skills", s), join(pluginDir(), "skills", s));
      const configPath = join(base, "opencode.json");
      const config = readJson(configPath);
      const entry = { type: "local", command: [cmd, "mcp"], enabled: true };
      const existing = config.mcp?.["job-search"];
      if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) conflicts.push(`${configPath} (mcp.job-search points elsewhere)`);
      else if (!existing) {
        const next = { $schema: "https://opencode.ai/config.json", ...config, mcp: { ...(config.mcp ?? {}), "job-search": entry } };
        changes.push({ action: "write", path: configPath, reason: "add mcp.job-search", content: JSON.stringify(next, null, 2) + "\n" });
      }
      shimPlan(changes, conflicts);
      break;
    }
    case "pi": {
      const settingsPath = join(home(), ".pi", "agent", "settings.json");
      const settings = readJson(settingsPath);
      const packages: unknown[] = Array.isArray(settings.packages) ? settings.packages : [];
      const src = pluginDir();
      if (!packages.some((p) => p === src || (typeof p === "object" && p !== null && (p as { source?: string }).source === src))) {
        changes.push({ action: "write", path: settingsPath, reason: "add package", content: JSON.stringify({ ...settings, packages: [...packages, src] }, null, 2) + "\n" });
      }
      shimPlan(changes, conflicts);
      break;
    }
    case "mcp":
      notes.push("generic MCP host: add this stdio server to the host's config", JSON.stringify({ "job-search": { command: cmd, args: ["mcp"] } }));
      break;
  }
  return { changes, conflicts, notes };
}

export function planUninstall(host: Host, scope: string | undefined): { changes: Change[]; notes: string[] } {
  const changes: Change[] = [];
  const notes: string[] = [];
  const skills = pluginSkills();
  const unlinkIfOurs = (p: string) => {
    if (ours(p)) changes.push({ action: "unlink", path: p });
  };
  switch (host) {
    case "claude": {
      const claude = resolveBin("claude");
      if (claude) changes.push({ action: "run", command: [claude, "plugin", "uninstall", `job-search@${MARKETPLACE}`, ...(scope === "project" ? ["--scope", "project"] : [])] });
      else notes.push("claude CLI not found; inside Claude Code run: /plugin uninstall job-search@" + MARKETPLACE);
      break;
    }
    case "hermes": {
      const root = hermesRoot(scope);
      for (const s of skills) unlinkIfOurs(join(root, "skills", `job-search-${s}`));
      const config = join(root, "config.yaml");
      if (existsSync(config)) {
        const current = readFileSync(config, "utf-8");
        const block = new RegExp(`^  job-search:\\n    command: ${JSON.stringify(launcher()).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\n    args: \\["mcp"\\]\\n?`, "m");
        if (block.test(current)) changes.push({ action: "write", path: config, reason: "remove mcp_servers.job-search", content: current.replace(block, "") });
      }
      break;
    }
    case "openclaw":
      for (const s of skills) unlinkIfOurs(join(home(), ".openclaw", "workspace", "skills", `job-search-${s}`));
      if (resolveBin("openclaw")) changes.push({ action: "run", command: [resolveBin("openclaw")!, "mcp", "unset", "job-search"] });
      break;
    case "opencode": {
      const base = join(home(), ".config", "opencode");
      for (const s of skills) unlinkIfOurs(join(base, "skills", s));
      const configPath = join(base, "opencode.json");
      const config = readJson(configPath);
      if (JSON.stringify(config.mcp?.["job-search"]?.command) === JSON.stringify([launcher(), "mcp"])) {
        const { "job-search": _drop, ...rest } = config.mcp;
        changes.push({ action: "write", path: configPath, reason: "remove mcp.job-search", content: JSON.stringify({ ...config, mcp: rest }, null, 2) + "\n" });
      }
      break;
    }
    case "pi": {
      const settingsPath = join(home(), ".pi", "agent", "settings.json");
      const settings = readJson(settingsPath);
      if (Array.isArray(settings.packages) && settings.packages.includes(pluginDir())) {
        changes.push({ action: "write", path: settingsPath, reason: "remove package", content: JSON.stringify({ ...settings, packages: settings.packages.filter((p: unknown) => p !== pluginDir()) }, null, 2) + "\n" });
      }
      break;
    }
    case "mcp":
      notes.push("remove the job-search entry from the host's MCP config by hand");
      break;
  }
  return { changes, notes };
}

function apply(changes: Change[]): Array<{ change: Change; ok: boolean; detail?: string }> {
  const results: Array<{ change: Change; ok: boolean; detail?: string }> = [];
  for (const change of changes) {
    try {
      if (change.action === "link") {
        mkdirSync(dirname(change.path), { recursive: true });
        symlinkSync(change.target, change.path);
      } else if (change.action === "unlink") {
        unlinkSync(change.path);
      } else if (change.action === "write") {
        mkdirSync(dirname(change.path), { recursive: true });
        writeFileSync(change.path, change.content);
      } else {
        const proc = Bun.spawnSync(change.command, { stdout: "pipe", stderr: "pipe" });
        if (proc.exitCode !== 0) throw new Error((proc.stderr.toString() || proc.stdout.toString()).trim().split("\n").pop() ?? `exit ${proc.exitCode}`);
      }
      results.push({ change, ok: true });
    } catch (err) {
      // No hidden retries: report and stop; earlier changes are listed so the user can undo them.
      results.push({ change, ok: false, detail: err instanceof Error ? err.message : String(err) });
      break;
    }
  }
  return results;
}

const summarise = (changes: Change[]) =>
  changes.map((c) => (c.action === "write" ? { action: c.action, path: c.path, reason: c.reason } : c));

function hostArg(values: Values): Host {
  const host = str(values, "host") as Host;
  if (!HOSTS.includes(host)) throw new AgentError("validation", `--host must be one of ${HOSTS.join(", ")}`);
  return host;
}

async function runInstall(values: Values): Promise<CommandResult> {
  const host = hostArg(values);
  const scope = str(values, "scope");
  const { changes, conflicts, notes } = planInstall(host, scope);
  if (conflicts.length > 0) {
    throw new AgentError("conflict", `refusing to replace ${conflicts.length} item(s) this installer did not create; nothing was changed`, ["move or rename the conflicting items, then retry"], true, { conflicts });
  }
  const preview = confirmWrite(values, "hosts-install", `jobsearch hosts-install --host ${host}${scope ? ` --scope ${scope}` : ""}`);
  if (preview || changes.length === 0) return { data: { host, scope: scope ?? "user", dryRun: preview, changes: summarise(changes), notes, alreadyInstalled: changes.length === 0 }, exit: preview ? EXIT.dryRun : EXIT.ok };
  const results = apply(changes);
  const failed = results.find((r) => !r.ok);
  if (failed) throw new AgentError("external", `step failed: ${failed.detail}`, [], true, { applied: results.filter((r) => r.ok).map((r) => summarise([r.change])[0]) });
  return { data: { host, scope: scope ?? "user", applied: summarise(changes), notes, next: "jobsearch hosts-doctor" } };
}

async function runUninstall(values: Values): Promise<CommandResult> {
  const host = hostArg(values);
  const scope = str(values, "scope");
  const { changes, notes } = planUninstall(host, scope);
  const preview = confirmWrite(values, "hosts-uninstall", `jobsearch hosts-uninstall --host ${host}`);
  if (preview || changes.length === 0) return { data: { host, dryRun: preview, changes: summarise(changes), notes, nothingInstalled: changes.length === 0 }, exit: preview ? EXIT.dryRun : EXIT.ok };
  const results = apply(changes);
  const failed = results.find((r) => !r.ok);
  if (failed) throw new AgentError("external", `step failed: ${failed.detail}`);
  return { data: { host, removed: summarise(changes), notes } };
}

function detect(): Record<Host, boolean> {
  const h = home();
  return {
    claude: Boolean(resolveBin("claude")) || existsSync(join(h, ".claude")),
    hermes: Boolean(resolveBin("hermes")) || existsSync(join(h, ".hermes")),
    opencode: Boolean(resolveBin("opencode")) || existsSync(join(h, ".config", "opencode")),
    openclaw: Boolean(resolveBin("openclaw")) || existsSync(join(h, ".openclaw")),
    pi: Boolean(resolveBin("pi")) || existsSync(join(h, ".pi")),
    mcp: true,
  };
}

async function runList(): Promise<CommandResult> {
  return { data: { pluginDir: pluginDir(), launcher: launcher(), hosts: detect() } };
}

type McpStatus = { registered: "current" | "legacy" | "other" | "none"; command?: unknown; args?: unknown; legacyEntries?: string[]; hint?: string };

/** The pre-2.0 server (`bun run mcp` / scripts/mcp/server.ts) exposes the old tool set. */
const LEGACY_MCP = /scripts\/mcp\/server\.ts|"run"\s*,\s*"mcp"|\brun mcp\b/;

/**
 * What a host's MCP config actually registers. "the plugin is installed" and
 * "the host loads the new server" are different facts: a live Hermes kept
 * serving the legacy 19-tool registry while the new launcher worked from the
 * CLI (issue #10). This names which server each entry points at.
 */
export function classifyMcp(servers: Record<string, unknown> | undefined, command: string, config: string): McpStatus {
  const entries = Object.entries(servers ?? {});
  const legacyEntries = entries.filter(([, entry]) => LEGACY_MCP.test(JSON.stringify(entry))).map(([name]) => name);
  const ours = (servers ?? {})["job-search"] as { command?: unknown; args?: unknown } | undefined;
  const flat = ours ? [ours.command, ...(Array.isArray(ours.args) ? ours.args : [])].flat() : [];
  const registered: McpStatus["registered"] = !ours
    ? "none"
    : flat[0] === command && flat.slice(1).join(" ") === "mcp"
      ? "current"
      : LEGACY_MCP.test(JSON.stringify(ours))
        ? "legacy"
        : "other";
  const hint = legacyEntries.length > 0
    ? `remove the legacy entr${legacyEntries.length > 1 ? "ies" : "y"} ${legacyEntries.join(", ")} from ${config} by hand (hosts-install never overwrites what it did not write), then hosts-install, start a new host session, and confirm the host lists jobsearch_status`
    : registered === "other"
      ? `mcp job-search in ${config} points at another command; check it before replacing it`
      : registered === "none"
        ? "not registered: run hosts-install for this host"
        : undefined;
  return { registered, ...(ours ? { command: ours.command, args: ours.args } : {}), ...(legacyEntries.length ? { legacyEntries } : {}), ...(hint ? { hint } : {}) };
}

function hermesServers(config: string): Record<string, unknown> | undefined {
  if (!existsSync(config)) return undefined;
  try {
    return (Bun.YAML.parse(readFileSync(config, "utf-8")) as { mcp_servers?: Record<string, unknown> } | null)?.mcp_servers ?? undefined;
  } catch {
    return undefined;
  }
}

/** OpenCode stores the command as one array; split it into the command/args shape. */
function opencodeServers(config: string): Record<string, unknown> {
  const mcp = (readJson(config).mcp ?? {}) as Record<string, { command?: unknown[] }>;
  return Object.fromEntries(Object.entries(mcp).map(([name, entry]) => [name, Array.isArray(entry?.command) ? { command: entry.command[0], args: entry.command.slice(1) } : entry]));
}

async function runDoctor(values: Values): Promise<CommandResult> {
  const h = home();
  const skills = pluginSkills();
  const linked = (dir: string, prefix: string) => skills.filter((s) => ours(join(dir, `${prefix}${s}`))).length;
  const hermes = hermesRoot(str(values, "scope"));
  const claudeInstalled = (() => {
    const p = join(h, ".claude", "plugins", "installed_plugins.json");
    return existsSync(p) && readFileSync(p, "utf-8").includes(`job-search@${MARKETPLACE}`);
  })();
  const present = detect();
  const shim = join(h, ".local", "bin", "jobsearch");
  return {
    data: {
      pluginDir: pluginDir(),
      skills: skills.length,
      pathShim: ours(shim),
      hosts: {
        claude: { present: present.claude, registered: claudeInstalled },
        hermes: { present: present.hermes, skillsLinked: linked(join(hermes, "skills"), "job-search-"), ...mcpFields(classifyMcp(hermesServers(join(hermes, "config.yaml")), launcher(), join(hermes, "config.yaml"))) },
        opencode: { present: present.opencode, skillsLinked: linked(join(h, ".config", "opencode", "skills"), ""), ...mcpFields(classifyMcp(opencodeServers(join(h, ".config", "opencode", "opencode.json")), launcher(), join(h, ".config", "opencode", "opencode.json"))) },
        openclaw: { present: present.openclaw, skillsLinked: linked(join(h, ".openclaw", "workspace", "skills"), "job-search-") },
        pi: { present: present.pi, registered: (readJson(join(h, ".pi", "agent", "settings.json")).packages ?? []).includes(pluginDir()) },
      },
    },
  };
}

/** `mcp` stays a boolean (true only for the current server); `mcpServer` explains it. */
function mcpFields(status: McpStatus): { mcp: boolean; mcpServer: McpStatus } {
  return { mcp: status.registered === "current", mcpServer: status };
}

const HOST_FLAG = { type: "string" as const, required: true, description: HOSTS.join("|"), enum: HOSTS };
const SCOPE_FLAG = { type: "string" as const, description: "user (default) | project (claude) | profile:<name> (hermes)" };
const WRITE_FLAGS = {
  yes: { type: "boolean" as const, description: "Apply — only after a human yes in-conversation" },
  "dry-run": { type: "boolean" as const, description: "Preview the exact changes; exit 10" },
};

export const HOST_COMMANDS: Record<string, CommandSpec> = {
  "hosts-list": { summary: "Agent hosts present on this machine, plugin and launcher paths", mutation: false, output: "json", flags: {}, run: runList },
  "hosts-doctor": { summary: "Whether this plugin's skills, MCP server and PATH shim are registered on each host", mutation: false, output: "json", flags: { scope: SCOPE_FLAG }, run: runDoctor },
  "hosts-install": { summary: "Install on a host (skills, MCP, PATH shim); refuses to replace anything it did not create", mutation: true, output: "json", flags: { host: HOST_FLAG, scope: SCOPE_FLAG, ...WRITE_FLAGS }, run: runInstall },
  "hosts-uninstall": { summary: "Remove only what hosts-install created on a host", mutation: true, output: "json", flags: { host: HOST_FLAG, scope: SCOPE_FLAG, ...WRITE_FLAGS }, run: runUninstall },
};
