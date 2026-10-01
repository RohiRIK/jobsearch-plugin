import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hermesConfigWithMcp } from "../src/jobsearch/hosts.js";

const ROOT = resolve(import.meta.dir, "..");
const PLUGIN = join(ROOT, "job-search");
const LAUNCHER = join(PLUGIN, "scripts", "jobsearch");
const SKILLS = readdirSync(join(PLUGIN, "skills")).filter((d) => existsSync(join(PLUGIN, "skills", d, "SKILL.md")));
let home: string;

/** Run against the source CLI with a throwaway HOME and a PATH without real host CLIs. */
function js(args: string[]) {
  const proc = Bun.spawnSync([process.execPath, join(ROOT, "scripts/jobsearch.ts"), ...args], {
    env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin", JOB_SEARCH_HOME: join(home, "ws"), JOB_SEARCH_TELEMETRY: "0" },
  });
  return { code: proc.exitCode, out: JSON.parse(proc.stdout.toString()) };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "hosts-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("hosts-install: shared contract", () => {
  test("refuses without --yes and previews with --dry-run, writing nothing", () => {
    mkdirSync(join(home, ".hermes"));
    expect(js(["hosts-install", "--host", "hermes"]).out.error.type).toBe("confirmation_required");
    const preview = js(["hosts-install", "--host", "hermes", "--dry-run"]);
    expect(preview.code).toBe(10);
    expect(preview.out.data.changes.length).toBe(SKILLS.length + 2); // skills + config + PATH shim
    expect(existsSync(join(home, ".hermes", "skills"))).toBe(false);
  });

  test("rejects an unknown host", () => {
    expect(js(["hosts-install", "--host", "emacs", "--dry-run"]).code).toBe(2);
  });

  test("a second install is a no-op", () => {
    mkdirSync(join(home, ".hermes"));
    expect(js(["hosts-install", "--host", "hermes", "--yes"]).code).toBe(0);
    const again = js(["hosts-install", "--host", "hermes", "--yes"]);
    expect(again.code).toBe(0);
    expect(again.out.data.alreadyInstalled).toBe(true);
  });

  test("refuses (exit 5) to replace an unrelated skill, and changes nothing at all", () => {
    mkdirSync(join(home, ".openclaw", "workspace", "skills", "job-search-cv"), { recursive: true });
    writeFileSync(join(home, ".openclaw", "workspace", "skills", "job-search-cv", "keep"), "mine");
    const run = js(["hosts-install", "--host", "openclaw", "--yes"]);
    expect(run.code).toBe(5);
    expect(run.out.error.details.conflicts[0]).toContain("job-search-cv");
    expect(readdirSync(join(home, ".openclaw", "workspace", "skills"))).toEqual(["job-search-cv"]);
    expect(existsSync(join(home, ".local", "bin", "jobsearch"))).toBe(false);
  });

  test("refuses a dangling or foreign symlink with our name", () => {
    mkdirSync(join(home, ".openclaw", "workspace", "skills"), { recursive: true });
    symlinkSync("/gone/job-search/skills/outcome", join(home, ".openclaw", "workspace", "skills", "job-search-outcome"));
    expect(js(["hosts-install", "--host", "openclaw", "--yes"]).code).toBe(5);
    expect(readlinkSync(join(home, ".openclaw", "workspace", "skills", "job-search-outcome"))).toBe("/gone/job-search/skills/outcome");
  });

  test("installs a PATH shim that runs the plugin from anywhere", () => {
    mkdirSync(join(home, ".pi"));
    js(["hosts-install", "--host", "pi", "--yes"]);
    const shim = join(home, ".local", "bin", "jobsearch");
    expect(lstatSync(shim).isSymbolicLink()).toBe(true);
    expect(readlinkSync(shim)).toBe(LAUNCHER);
  });
});

describe("hosts-install: per host", () => {
  test("hermes profile scope: links every plugin skill and merges into an existing mcp_servers block", () => {
    const profile = join(home, ".hermes", "profiles", "work");
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "config.yaml"), "model: x\nmcp_servers:\n  other:\n    command: foo\n");
    expect(js(["hosts-install", "--host", "hermes", "--scope", "profile:work", "--yes"]).code).toBe(0);
    for (const s of SKILLS) expect(readlinkSync(join(profile, "skills", `job-search-${s}`))).toBe(join(PLUGIN, "skills", s));
    const config = readFileSync(join(profile, "config.yaml"), "utf-8");
    expect(config.match(/^mcp_servers:/gm)).toHaveLength(1);
    expect(config).toContain(JSON.stringify(LAUNCHER));
    expect(config).toContain("  other:");
  });

  test("hermes refuses an invalid or missing profile", () => {
    mkdirSync(join(home, ".hermes"));
    expect(js(["hosts-install", "--host", "hermes", "--scope", "profile:../evil", "--dry-run"]).code).toBe(2);
    expect(js(["hosts-install", "--host", "hermes", "--scope", "profile:Ghost", "--dry-run"]).code).toBe(3);
  });

  test("hermes keeps a job-search MCP entry that points elsewhere (conflict)", () => {
    mkdirSync(join(home, ".hermes"), { recursive: true });
    writeFileSync(join(home, ".hermes", "config.yaml"), "mcp_servers:\n  job-search:\n    command: bun\n");
    const run = js(["hosts-install", "--host", "hermes", "--yes"]);
    expect(run.code).toBe(5);
    expect(readFileSync(join(home, ".hermes", "config.yaml"), "utf-8")).toBe("mcp_servers:\n  job-search:\n    command: bun\n");
  });

  test("opencode: plain-name skill links (name must equal directory) and a merged opencode.json", () => {
    const base = join(home, ".config", "opencode");
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, "opencode.json"), JSON.stringify({ theme: "dark", mcp: { other: { type: "local", command: ["x"] } } }));
    expect(js(["hosts-install", "--host", "opencode", "--yes"]).code).toBe(0);
    for (const s of SKILLS) expect(readlinkSync(join(base, "skills", s))).toBe(join(PLUGIN, "skills", s));
    const config = JSON.parse(readFileSync(join(base, "opencode.json"), "utf-8"));
    expect(config.theme).toBe("dark");
    expect(config.mcp.other).toBeDefined();
    expect(config.mcp["job-search"]).toEqual({ type: "local", command: [LAUNCHER, "mcp"], enabled: true });
  });

  test("openclaw without its CLI still links skills and says MCP was skipped", () => {
    const run = js(["hosts-install", "--host", "openclaw", "--yes"]);
    expect(run.code).toBe(0);
    expect(run.out.data.notes.join(" ")).toContain("MCP registration skipped");
    expect(readdirSync(join(home, ".openclaw", "workspace", "skills")).sort()).toEqual(SKILLS.map((s) => `job-search-${s}`).sort());
  });

  test("pi: adds the plugin directory as a local package, once", () => {
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    writeFileSync(join(home, ".pi", "agent", "settings.json"), JSON.stringify({ packages: ["npm:other"] }));
    js(["hosts-install", "--host", "pi", "--yes"]);
    js(["hosts-install", "--host", "pi", "--yes"]);
    expect(JSON.parse(readFileSync(join(home, ".pi", "agent", "settings.json"), "utf-8")).packages).toEqual(["npm:other", PLUGIN]);
  });

  test("mcp: prints a generic stdio entry and writes nothing", () => {
    const run = js(["hosts-install", "--host", "mcp", "--yes"]);
    expect(run.code).toBe(0);
    expect(run.out.data.notes.join(" ")).toContain(LAUNCHER);
    expect(readdirSync(home).filter((d) => d !== ".bun")).toEqual([]); // Bun may create its own cache
  });
});

describe("hosts-uninstall and doctor", () => {
  test("uninstall removes only what install created, and restores the config", () => {
    const base = join(home, ".config", "opencode");
    mkdirSync(join(base, "skills", "unrelated"), { recursive: true });
    js(["hosts-install", "--host", "opencode", "--yes"]);
    expect(js(["hosts-doctor"]).out.data.hosts.opencode).toMatchObject({ skillsLinked: SKILLS.length, mcp: true });
    expect(js(["hosts-uninstall", "--host", "opencode", "--dry-run"]).code).toBe(10);
    expect(js(["hosts-uninstall", "--host", "opencode", "--yes"]).code).toBe(0);
    expect(readdirSync(join(base, "skills"))).toEqual(["unrelated"]);
    expect(JSON.parse(readFileSync(join(base, "opencode.json"), "utf-8")).mcp["job-search"]).toBeUndefined();
    expect(js(["hosts-doctor"]).out.data.hosts.opencode).toMatchObject({ skillsLinked: 0, mcp: false });
  });

  test("hosts-list reports presence by config directory", () => {
    mkdirSync(join(home, ".hermes"));
    const { data } = js(["hosts-list"]).out;
    expect(data.hosts.hermes).toBe(true);
    expect(data.hosts.pi).toBe(false);
    expect(data.launcher).toBe(LAUNCHER);
  });
});

describe("hermes config merge", () => {
  test("appends a block to a config without mcp_servers", () => {
    expect(hermesConfigWithMcp("model: x\n", "/p/jobsearch")).toBe('model: x\nmcp_servers:\n  job-search:\n    command: "/p/jobsearch"\n    args: ["mcp"]\n');
  });
  test("recognises its own entry as present", () => {
    const once = hermesConfigWithMcp("", "/p/jobsearch") as string;
    expect(hermesConfigWithMcp(once, "/p/jobsearch")).toBe("present");
    expect(hermesConfigWithMcp(once, "/q/jobsearch")).toBe("conflict");
  });
});

describe("deprecated shell wrappers", () => {
  test("hermes.sh --dry-run delegates to hosts-install", () => {
    mkdirSync(join(home, ".hermes"));
    const proc = Bun.spawnSync(["bash", join(ROOT, ".agents/install/hermes.sh"), "--dry-run"], { env: { ...process.env, HOME: home, PATH: `/usr/bin:/bin:${process.env.PATH}`, JOB_SEARCH_TELEMETRY: "0" } });
    expect(proc.exitCode).toBe(10);
    expect(JSON.parse(proc.stdout.toString()).data.host).toBe("hermes");
  });
});
