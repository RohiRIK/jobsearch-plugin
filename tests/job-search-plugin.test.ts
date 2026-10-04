import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { COMMANDS } from "../src/jobsearch/registry.js";
import { TOOL_MAP } from "../src/jobsearch/toolmap.js";
import { SYNCED } from "../scripts/plugin/sync-skills.js";

const read = (path: string) => readFileSync(path, "utf-8");
const ROOT = resolve(import.meta.dir, "..");
const PLUGIN = join(ROOT, "job-search");
const SKILLS_DIR = join(PLUGIN, "skills");

// Two manifests, one directory: Hermes reads plugin.json at the root (Agent
// Plugins v1), Claude Code reads .claude-plugin/plugin.json, Pi reads package.json.
const portable = JSON.parse(read(join(PLUGIN, "plugin.json")));
const manifest = JSON.parse(read(join(PLUGIN, ".claude-plugin", "plugin.json")));
const piPackage = JSON.parse(read(join(PLUGIN, "package.json")));

const AGENT_PLUGINS_V1 = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA_V1 = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
// Mirrors _PLUGIN_FIELDS / _PLUGIN_NAME_RE / _SKILL_NAME_RE / _STDIO_FIELDS in hermes_cli/agent_plugins.py.
const PORTABLE_FIELDS = new Set(["$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"]);
const PORTABLE_NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SKILL_NAME = /^(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STDIO_FIELDS = new Set(["type", "command", "args", "env", "cwd"]);

const skillNames = readdirSync(SKILLS_DIR).filter((d) => existsSync(join(SKILLS_DIR, d, "SKILL.md"))).sort();
const syncedNames = Object.values(SYNCED).map((s) => s.name);
const workflowSkills = skillNames.filter((n) => !syncedNames.includes(n));
const skillBody = (name: string) => read(join(SKILLS_DIR, name, "SKILL.md"));
const packageScripts: Record<string, string> = JSON.parse(read(join(ROOT, "package.json"))).scripts;

function frontmatter(body: string): string {
  const m = body.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error("no frontmatter");
  return m[1];
}

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...markdownFiles(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Plugin docs that are ours to keep correct (synced library skills are checked by their own drift test). */
const ownDocs = [
  ...workflowSkills.flatMap((n) => markdownFiles(join(SKILLS_DIR, n))),
  ...markdownFiles(join(PLUGIN, "commands")),
  ...markdownFiles(join(PLUGIN, "agents")),
];

describe("Hermes portable manifest (Agent Plugins v1)", () => {
  test("declares the exact schema Hermes checks for", () => {
    expect(portable.$schema).toBe(AGENT_PLUGINS_V1);
  });

  // Hermes drops unknown top-level fields with a diagnostic rather than failing.
  test("carries no field outside the v1 set", () => {
    for (const field of Object.keys(portable)) expect(PORTABLE_FIELDS.has(field)).toBe(true);
  });

  test("name satisfies the v1 constraint", () => {
    expect(portable.name).toMatch(PORTABLE_NAME);
  });

  test("all three manifests agree on name and version", () => {
    expect(portable.name).toBe(manifest.name);
    expect(portable.version).toBe(manifest.version);
    expect(piPackage.version).toBe(portable.version);
  });

  test("shared metadata is identical; the Claude manifest only adds userConfig", () => {
    const { $schema, ...shared } = portable;
    const { userConfig, ...claudeShared } = manifest;
    expect($schema).toBe(AGENT_PLUGINS_V1);
    expect(claudeShared).toEqual(shared);
    expect(userConfig.data_dir.type).toBe("directory");
  });

  test("mcp.json has exactly the v1 shape and a stdio entry Hermes accepts", () => {
    const config = JSON.parse(read(join(PLUGIN, "mcp.json")));
    expect(Object.keys(config).sort()).toEqual(["$schema", "mcpServers"]);
    expect(config.$schema).toBe(MCP_SCHEMA_V1);
    const server = config.mcpServers[portable.name];
    expect(server.type).toBe("stdio");
    for (const field of Object.keys(server)) expect(STDIO_FIELDS.has(field)).toBe(true);
    expect(server.command.startsWith("./")).toBe(true);
    expect(existsSync(join(PLUGIN, server.command))).toBe(true);
  });
});

describe("Claude Code plugin", () => {
  test("component directories are at the plugin root, not inside .claude-plugin", () => {
    for (const stray of ["skills", "commands", "agents", "hooks"]) {
      expect(existsSync(join(PLUGIN, ".claude-plugin", stray))).toBe(false);
    }
  });

  // claude.ai and Cowork refuse to install a plugin with a top-level bin/.
  test("ships no top-level bin/ directory", () => {
    expect(existsSync(join(PLUGIN, "bin"))).toBe(false);
  });

  test(".mcp.json runs the launcher from the plugin root and only references declared userConfig", () => {
    const server = JSON.parse(read(join(PLUGIN, ".mcp.json"))).mcpServers[manifest.name];
    expect(server.command).toBe("${CLAUDE_PLUGIN_ROOT}/scripts/jobsearch");
    expect(server.args).toEqual(["mcp"]);
    for (const m of JSON.stringify(server).matchAll(/\$\{user_config\.([a-z_]+)\}/g)) expect(manifest.userConfig).toHaveProperty(m[1]);
  });

  test("the marketplace lists this plugin by its manifest name", () => {
    const market = JSON.parse(read(join(ROOT, ".claude-plugin", "marketplace.json")));
    const entry = market.plugins.find((p: { name: string }) => p.name === manifest.name);
    expect(entry.source).toBe("./job-search");
    expect(entry.version).toBeUndefined(); // version lives in plugin.json only
  });

  test("no skill and command share a name (both would be /job-search:<name>)", () => {
    const commands = readdirSync(join(PLUGIN, "commands")).map((f) => f.replace(/\.md$/, ""));
    for (const c of commands) expect(skillNames).not.toContain(c);
  });

  test("every command has frontmatter with a description", () => {
    for (const f of readdirSync(join(PLUGIN, "commands"))) {
      expect(frontmatter(read(join(PLUGIN, "commands", f)))).toMatch(/description: .{20,}/);
    }
  });
});

describe("Pi package", () => {
  test("declares the shared skills", () => {
    expect(piPackage.name).toBe("@rohi/job-search-agent-plugin");
    expect(piPackage.keywords).toContain("pi-package");
    expect(piPackage.pi).toEqual({ skills: ["./skills/*/SKILL.md"] });
  });
});

describe("skills", () => {
  test("ships the workflow skills, manage, and the synced skill factory", () => {
    expect(workflowSkills).toEqual(["cv", "init", "manage", "outcome", "research"]);
    expect(skillNames).toEqual(expect.arrayContaining(syncedNames));
  });

  for (const name of skillNames) {
    describe(name, () => {
      test("has frontmatter with a name matching its directory and the Agent Skills slug pattern", () => {
        expect(frontmatter(skillBody(name))).toContain(`name: ${name}`);
        expect(name).toMatch(SKILL_NAME);
      });

      // hermes_cli/agent_plugins.py rejects a non-string allowed-tools.
      test("allowed-tools is a scalar string, not a YAML list", () => {
        const line = frontmatter(skillBody(name)).split("\n").find((l) => l.startsWith("allowed-tools:"));
        if (line) expect(line).not.toMatch(/allowed-tools:\s*\[/);
      });

      test("runs its commands itself instead of asking the user to use the CLI", () => {
        expect(skillBody(name)).toContain("Never ask the user to run a command");
      });

      test("has a description saying when to use it and when not to", () => {
        const description = frontmatter(skillBody(name)).match(/description:\s*(.+)/)?.[1] ?? "";
        expect(description.length).toBeGreaterThan(80);
        expect(description.length).toBeLessThanOrEqual(1024);
        expect(description).toContain("USE WHEN");
        expect(description).toContain("NOT FOR");
      });
    });
  }

  test("manage stays within the skill library's 50-line SKILL.md budget", () => {
    expect(skillBody("manage").split("\n").length).toBeLessThanOrEqual(50);
  });

  test("no workflow skill keeps the per-call checkout-root resolution ritual", () => {
    for (const name of workflowSkills) expect(skillBody(name)).not.toContain("realpathSync");
  });
});

// Skills defer to commands instead of restating them; that only holds while
// the commands they name still exist.
describe("every command the plugin docs name actually exists", () => {
  const jobsearch = new Set<string>();
  const tools = new Set<string>();
  const scripts = new Set<string>();
  for (const file of ownDocs) {
    const body = read(file);
    for (const m of body.matchAll(/jobsearch run ([a-z][a-z0-9:-]*)/g)) tools.add(m[1]);
    for (const m of body.matchAll(/jobsearch ([a-z][a-z0-9-]*)/g)) if (m[1] !== "run") jobsearch.add(m[1]);
    // A line that cd's into another package (a portal CLI) runs that package's scripts, not ours.
    for (const line of body.split("\n").filter((l) => !/\bcd\s/.test(l))) {
      for (const m of line.matchAll(/bun run ([a-z][a-z0-9:-]*)(?=[\s`'")]|$)/g)) scripts.add(m[1]);
    }
  }
  // Words after "jobsearch" in prose that are not commands.
  for (const prose of ["is", "on", "logs", "itself", "command", "calls", "call"]) jobsearch.delete(prose);

  test("docs reference a meaningful number of commands", () => {
    expect(jobsearch.size).toBeGreaterThan(8);
    expect(tools.size).toBeGreaterThan(5);
  });
  for (const c of jobsearch) test(`jobsearch ${c}`, () => expect(Object.keys(COMMANDS)).toContain(c));
  for (const t of tools) test(`jobsearch run ${t}`, () => expect(Object.keys(TOOL_MAP)).toContain(t));
  for (const s of scripts) test(`bun run ${s} (checkout-only)`, () => expect(Object.keys(packageScripts)).toContain(s));
});

describe("the plugin is self-contained", () => {
  test("no plugin doc points at repo-only paths", () => {
    for (const file of ownDocs) {
      const body = read(file);
      expect(body).not.toContain(".claude/skills/");
      expect(body).not.toContain(".claude/commands/");
      expect(body).not.toContain("docs/workflows/");
      expect(body).not.toMatch(/`job-search\/skills\//);
    }
  });

  test("relative links between skills resolve", () => {
    for (const file of ownDocs) {
      for (const m of read(file).matchAll(/`(\.\.\/[a-z-]+\/[A-Za-z0-9_.-]+\.md)`/g)) {
        expect(existsSync(resolve(dirname(file), m[1]))).toBe(true);
      }
    }
  });

  test("every <assistant>/ reference has a shipped default in skills/cv", () => {
    for (const file of ownDocs) {
      for (const m of read(file).matchAll(/<assistant>\/(0\d-[a-z-]+(?:\.example)?\.md)/g)) {
        const name = m[1] === "01-candidate-profile.md" ? "01-candidate-profile.example.md" : m[1];
        expect(existsSync(join(SKILLS_DIR, "cv", name))).toBe(true);
      }
    }
  });
});

describe("repo integration", () => {
  const openCode = JSON.parse(read(join(ROOT, "opencode.json")));

  test("the repo has no root .mcp.json: the plugin owns the Claude MCP registration", () => {
    expect(existsSync(join(ROOT, ".mcp.json"))).toBe(false);
    const settings = JSON.parse(read(join(ROOT, ".claude", "settings.json")));
    expect(settings.enabledPlugins["job-search@rohirik"]).toBe(true);
  });

  for (const directory of [ROOT, join(ROOT, "docs")]) {
    test(`OpenCode MCP connects from ${directory === ROOT ? "root" : "nested docs/"}`, async () => {
      const [command, ...args] = openCode.mcp[portable.name].command as string[];
      const client = new Client({ name: "integration-test", version: "1.0.0" });
      const transport = new StdioClientTransport({ command, args, cwd: directory, stderr: "ignore" });
      try {
        await client.connect(transport);
        const { tools } = await client.listTools();
        expect(tools.map((tool) => tool.name)).toContain("jobsearch_prepare");
      } finally {
        await client.close();
      }
    }, 15000);
  }

  test("the .agents router routes to every workflow skill without duplicating bodies", () => {
    const native = read(join(ROOT, ".agents/skills/job-search-assistant/SKILL.md"));
    expect(native).toMatch(/^---\nname: job-search-assistant\n/);
    for (const name of workflowSkills) expect(native).toContain(`job-search/skills/${name}/SKILL.md`);
    expect(native).toContain("Never ask the user to execute a");
    expect(native).not.toContain("bun run application prepare");
  });

  test("only the router is a skill under .agents/skills (portal CLIs are not model-visible)", () => {
    const skills = readdirSync(join(ROOT, ".agents/skills")).filter((d) => existsSync(join(ROOT, ".agents/skills", d, "SKILL.md")));
    expect(skills).toEqual(["job-search-assistant"]);
    expect(existsSync(join(ROOT, ".claude", "skills"))).toBe(false);
  });

  test("legacy application pointers lead to the canonical CV skill", () => {
    for (const path of [".agents/skills/job-search-assistant/Workflows/TailorApplication.md", ".agents/skills/job-search-assistant/DocumentQuality.md"]) {
      expect(read(join(ROOT, path))).toContain("job-search/skills/cv/SKILL.md");
    }
  });

  test("local setup never recommends the global legacy installer", () => {
    for (const path of ["README.md", "SETUP.md", "AGENTS.md", "docs/AGENTS-INTEGRATION.md"]) {
      expect(read(join(ROOT, path))).not.toMatch(/(?:Run|Rerun|run) `?\.\/\.agents\/install-agent-skills\.sh`? (?:once|\()/);
    }
  });

  test("integration docs keep the MCP inventory, REST and security sections", () => {
    const body = read(join(ROOT, "docs/AGENTS-INTEGRATION.md"));
    for (const item of ["OpenClaw", "jobsearch://reports/latest", "tailor_application", "jobsearch_write", "hosts-install", "API_KEY", "127.0.0.1", "Security posture"]) {
      expect(body).toContain(item);
    }
    expect(read(join(ROOT, "README.md"))).toContain("docs/AGENTS-INTEGRATION.md");
  });
});

describe("a symlinked skill works from outside the checkout", () => {
  // OpenClaw and Hermes link skill directories into their own trees. The
  // launcher path a skill names must resolve through the link.
  test("each workflow skill's ../../scripts/jobsearch runs status from an unrelated directory", () => {
    const home = mkdtempSync(join(tmpdir(), "job-search-workspace-"));
    try {
      const skills = join(home, ".openclaw/workspace/skills");
      mkdirSync(skills, { recursive: true });
      for (const name of workflowSkills) {
        const link = join(skills, `job-search-${name}`);
        symlinkSync(join(SKILLS_DIR, name), link);
        const launcher = resolve(realpathSync(link), "../../scripts/jobsearch");
        const run = spawnSync(launcher, ["status", "--fields", "workspace"], { cwd: home, env: { ...process.env, HOME: home, JOB_SEARCH_HOME: join(home, "ws"), JOB_SEARCH_TELEMETRY: "0" }, encoding: "utf8" });
        expect(run.status).toBe(0);
        expect(JSON.parse(run.stdout).data.workspace.path).toBe(join(home, "ws"));
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("setup shipping gate", () => {
  test("missing ATS extraction remains non-shipping", () => {
    const setup = read(join(ROOT, "SETUP.md"));
    expect(setup).toContain("pdftotext");
    expect(setup).toMatch(/without (?:it|`pdftotext`)[^\n]*non-shipping/i);
    expect(setup).not.toContain("degrades to a visual keyword review");
  });
});

describe("skills carry the repo's hard rules", () => {
  test("application skill preserves independent eligibility, source and final QA", () => {
    for (const rule of ["eligibility.status", "source URL", "observation date", "URI annotations", "every rendered page"]) {
      expect(skillBody("cv")).toContain(rule);
    }
  });

  test("cv refuses to ship a document that has not passed the gate", () => {
    const body = skillBody("cv");
    expect(body).toContain("jobsearch gate");
    expect(body.toLowerCase()).toContain("exits 0");
    expect(body).toContain("submissionReady");
  });

  test("cv and init both forbid fabricating profile data", () => {
    expect(skillBody("cv").toLowerCase()).toContain("never fabricate");
    expect(skillBody("init").toLowerCase()).toContain("never invent profile data");
  });

  test("outcome requires a human yes before writing to the profile or tracker", () => {
    const body = skillBody("outcome");
    expect(body).toContain("confirm: true");
    expect(body.toLowerCase()).toContain("human yes");
  });

  test("cv and research defer market conventions to the CLI rather than memory", () => {
    for (const name of ["cv", "research"]) {
      expect(skillBody(name)).toContain("jobsearch run markets");
      expect(skillBody(name).toLowerCase()).toContain("from memory");
    }
  });

  test("manage gates every host install behind a dry run and a human yes", () => {
    const hosts = read(join(SKILLS_DIR, "manage", "Workflows", "Hosts.md"));
    expect(hosts).toContain("--dry-run");
    expect(hosts.toLowerCase()).toContain("ask for a yes");
  });
});

// jobsearch-plugin#17: an undeclared flag is now rejected before a tool runs.
// The outcome skill passed `reason log --note`, which the tool had silently
// ignored, so the observation was lost. Every flag the docs pass must exist.
describe("plugin docs pass only flags the tool declares", () => {
  test("every `jobsearch run <tool> --flag` in a plugin doc is accepted", async () => {
    const { TOOL_MAP } = await import("../src/jobsearch/toolmap.js");
    const { unknownFlag } = await import("../scripts/plugin/tools-entry.js");
    const bad: string[] = [];
    for (const file of ownDocs) for (const line of readFileSync(file, "utf-8").split("\n")) {
      for (const match of line.matchAll(/jobsearch run ([a-z:-]+)((?: [^`|]*)?)/g)) {
        const tool = TOOL_MAP[match[1]];
        if (!tool) continue;
        const flag = unknownFlag(match[2].trim().split(/\s+/).filter((arg) => arg.startsWith("-")), tool.flags, tool.short);
        if (flag) bad.push(`${file.slice(ROOT.length + 1)}: run ${match[1]} ${flag}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
