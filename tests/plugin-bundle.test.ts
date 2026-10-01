import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileHash, sourceHash } from "../scripts/plugin/build.js";
import { applicationPosting, applicationProfile } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");
const PLUGIN = join(ROOT, "job-search");
const build = JSON.parse(readFileSync(join(PLUGIN, "dist", "BUILD.json"), "utf-8")) as { sourceHash: string; bytes: number; files: Record<string, string> };

describe("committed bundle", () => {
  // Marketplace installs copy the repo; nothing builds on install. A stale
  // dist/ ships yesterday's behaviour under today's version number.
  test("is fresh: BUILD.json matches the current sources (run `bun run plugin:build`)", () => {
    expect(build.sourceHash).toBe(sourceHash());
  });

  // An ignored file (a local template.pdf) once landed in BUILD.json: it passed
  // here and failed in every fresh checkout. Everything recorded must be committed.
  test("records only files git tracks", () => {
    const tracked = new Set(Bun.spawnSync(["git", "-C", ROOT, "ls-files", "job-search"]).stdout.toString().split("\n"));
    const untracked = Object.keys(build.files).map((f) => `job-search/${f}`).filter((f) => !tracked.has(f));
    expect(untracked).toEqual([]);
  });

  test("was not hand-edited after the build", () => {
    for (const [file, hash] of Object.entries(build.files)) expect(fileHash(join(PLUGIN, file))).toBe(hash);
  });

  test("stays within the size budget and ships no native modules", () => {
    expect(build.bytes).toBeLessThanOrEqual(1_500_000);
    expect(Object.keys(build.files).some((f) => f.endsWith(".node") || f.endsWith(".wasm"))).toBe(false);
  });

  test("carries no test fixture or personal data", () => {
    for (const file of Object.keys(build.files)) {
      const text = readFileSync(join(PLUGIN, file), "utf-8");
      expect(text).not.toContain("alex@example.com");
      expect(text).not.toContain("Rohi-Rikman");
    }
  });
});

describe("installed outside the checkout", () => {
  let dir: string;
  let plugin: string;
  let home: string;
  const run = (args: string[], env: Record<string, string> = {}) => {
    const proc = Bun.spawnSync([join(plugin, "scripts", "jobsearch"), ...args], {
      cwd: dir,
      env: { ...process.env, JOB_SEARCH_HOME: home, TRACKER_DB: "", JOB_SEARCH_PLUGIN_ROOT: "", ...env },
    });
    return { code: proc.exitCode, out: JSON.parse(proc.stdout.toString() || "null") };
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "plugin-install-"));
    plugin = join(dir, "cache", "job-search");
    cpSync(PLUGIN, plugin, { recursive: true });
    home = join(dir, "home");
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(join(home, "data", "profile.json"), JSON.stringify(applicationProfile));
    writeFileSync(join(dir, "posting.txt"), applicationPosting);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("the launcher runs the bundle with the plugin's own templates", () => {
    const { code, out } = run(["triage", "--job", join(dir, "posting.txt")]);
    expect(code).toBe(0);
    expect(out.data.templates.cv).toBeTruthy();
  });

  test("status resolves the workspace from JOB_SEARCH_HOME and the code root to the plugin", () => {
    const { out } = run(["status"]);
    expect(out.data.workspace.path).toBe(home);
    expect(out.data.workspace.codeRoot).toBe(plugin);
  });

  test("delegated tools run from dist/tools", () => {
    const { code, out } = run(["prepare", "--company", "Acme", "--role", "Platform Engineer", "--job", join(dir, "posting.txt")]);
    expect(code).toBe(0);
    expect(out.data.paths.cv).toContain("Acme");
  });

  test("missing templates are a loud 'unavailable' error, never a silent null", () => {
    const broken = join(dir, "broken");
    cpSync(plugin, broken, { recursive: true });
    rmSync(join(broken, "templates"), { recursive: true, force: true });
    const proc = Bun.spawnSync([join(broken, "scripts", "jobsearch"), "triage", "--job", join(dir, "posting.txt")], {
      env: { ...process.env, JOB_SEARCH_HOME: home, JOB_SEARCH_PLUGIN_ROOT: "" },
    });
    const out = JSON.parse(proc.stdout.toString());
    expect(proc.exitCode).toBe(20);
    expect(out.error.type).toBe("unavailable");
  });

  test("the launcher follows a PATH shim symlink", () => {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const { symlinkSync } = require("node:fs") as typeof import("node:fs");
    symlinkSync(join(plugin, "scripts", "jobsearch"), join(bin, "jobsearch"));
    const proc = Bun.spawnSync([join(bin, "jobsearch"), "status"], { env: { ...process.env, JOB_SEARCH_HOME: home, JOB_SEARCH_PLUGIN_ROOT: "" } });
    expect(JSON.parse(proc.stdout.toString()).data.workspace.codeRoot).toBe(plugin);
    expect(existsSync(join(plugin, "dist", "jobsearch.js"))).toBe(true);
  });
});
