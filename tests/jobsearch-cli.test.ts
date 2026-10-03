import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Tracker } from "../src/tracker.js";
import { applicationPosting, applicationProfile, validApplicationDraft } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");
let dir: string;
let home: string;
let profilePath: string;

/** Every call runs against an isolated workspace — never the real data/. */
async function js(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, join(ROOT, "scripts/jobsearch.ts"), ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, JOB_SEARCH_HOME: home, TRACKER_DB: "", ...env },
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}
const parse = (stdout: string) => JSON.parse(stdout);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "jobsearch-cli-"));
  home = join(dir, "home");
  mkdirSync(join(home, "data", "jd"), { recursive: true });
  profilePath = join(home, "data", "profile.json");
  writeFileSync(profilePath, JSON.stringify(applicationProfile));
  writeFileSync(join(home, "data", "jd", "platform.txt"), applicationPosting);
  writeFileSync(join(home, "data", "jd", "unrelated.md"), "Pastry Chef. Requirements: French pastry, lamination, sourdough. Onsite in Paris, France.");
  writeFileSync(join(dir, "draft.json"), JSON.stringify(validApplicationDraft()));
  const tracker = new Tracker(join(home, "data", "tracker.db"));
  tracker.insert({ id: "app_20260901_example-labs", date: "2026-09-01", company: "Example Labs", role: "Platform Engineer", status: "applied" });
  tracker.close();
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("contract", () => {
  test("--help-json lists every command with its mutation flag and the exit table", async () => {
    const { code, stdout } = await js(["--help-json"]);
    expect(code).toBe(0);
    const help = parse(stdout);
    for (const name of ["status", "triage", "rank", "prepare", "review", "render", "gate", "scrape", "tracker-add", "tracker-status", "data-migrate", "mcp"]) {
      expect(help.commands).toHaveProperty(name);
    }
    for (const write of ["render", "tracker-add", "tracker-status", "data-migrate", "data-backup"]) expect(help.commands[write].mutation).toBe(true);
    expect(help.commands.triage.mutation).toBe(false);
    expect(help.exits["10"]).toContain("dry-run");
    expect(help.contractVersion).toBeGreaterThanOrEqual(2);
  });

  test("stdout is a single compact JSON line", async () => {
    const { code, stdout } = await js(["triage", "--job", join(home, "data", "jd", "platform.txt")]);
    expect(code).toBe(0);
    expect(stdout.trim().split("\n")).toHaveLength(1);
    expect(stdout).not.toContain("\n  ");
  });

  test("unknown command, unknown flag, missing required flag and bad enum are usage errors (exit 2)", async () => {
    for (const args of [["bogus"], ["triage", "--job", "x", "--nope"], ["triage"], ["tracker-list", "--status", "hired"]]) {
      const { code, stdout } = await js(args);
      expect(code).toBe(2);
      const out = parse(stdout);
      expect(out.ok).toBe(false);
      expect(out.error.code).toBe(2);
    }
  });

  test("a missing posting or profile is not-found (exit 3)", async () => {
    expect((await js(["triage", "--job", join(dir, "nope.txt")])).code).toBe(3);
    const missingProfile = await js(["triage", "--job", join(home, "data", "jd", "platform.txt"), "--profile", join(dir, "none.json")]);
    expect(missingProfile.code).toBe(3);
    expect(parse(missingProfile.stdout).error.type).toBe("not_found");
  });

  test("--fields keeps only the requested fields", async () => {
    const { stdout } = await js(["triage", "--job", join(home, "data", "jd", "platform.txt"), "--fields", "fit.score,next"]);
    const { data } = parse(stdout);
    expect(Object.keys(data).sort()).toEqual(["fit", "next"]);
    expect(Object.keys(data.fit)).toEqual(["score"]);
  });

  test("the call log records command, exit and size — never arguments", async () => {
    await js(["triage", "--job", join(home, "data", "jd", "platform.txt"), "--company", "SecretCorp"]);
    const log = readFileSync(join(home, "data", "state", "agent-calls.jsonl"), "utf-8");
    expect(log).toContain('"command":"triage"');
    expect(log).not.toContain("SecretCorp");
    expect(log).not.toContain("platform.txt");
  });

  test("JOB_SEARCH_TELEMETRY=0 disables the call log", async () => {
    const quietHome = join(dir, "quiet");
    mkdirSync(quietHome);
    await js(["data-where"], { JOB_SEARCH_HOME: quietHome, JOB_SEARCH_TELEMETRY: "0" });
    expect(existsSync(join(quietHome, "data", "state"))).toBe(false);
  });
});

describe("status and data", () => {
  test("status reports the env-resolved workspace, a valid profile and follow-ups", async () => {
    const { code, stdout } = await js(["status", "--days", "0"]);
    expect(code).toBe(0);
    const { data } = parse(stdout);
    expect(data.workspace.path).toBe(home);
    expect(data.workspace.resolvedFrom).toBe("env");
    expect(data.profile.valid).toBe(true);
    expect(data.tracker.total).toBe(1);
    expect(data.tracker.followupsDue).toBe(1);
    expect(data.postings.saved).toBe(2);
  });

  test("status in an empty workspace says to onboard instead of failing", async () => {
    const empty = join(dir, "empty");
    mkdirSync(empty);
    const { code, stdout } = await js(["status"], { JOB_SEARCH_HOME: empty });
    expect(code).toBe(0);
    const { data } = parse(stdout);
    expect(data.profile.exists).toBe(false);
    expect(data.next.join(" ")).toContain("onboard");
  });

  test("data-migrate previews, copies, refuses to overwrite, and leaves the source untouched", async () => {
    const target = join(dir, "migrated");
    const preview = await js(["data-migrate", "--from", home, "--to", target, "--dry-run"]);
    expect(preview.code).toBe(10);
    expect(existsSync(target)).toBe(false);

    expect((await js(["data-migrate", "--from", home, "--to", target])).code).toBe(2);

    const done = await js(["data-migrate", "--from", home, "--to", target, "--yes"]);
    expect(done.code).toBe(0);
    expect(parse(done.stdout).data.copied).toEqual(expect.arrayContaining(["data/profile.json", "data/tracker.db", "data/jd"]));
    expect(existsSync(profilePath)).toBe(true);
    const copy = new Tracker(join(target, "data", "tracker.db"));
    expect(copy.get("app_20260901_example-labs")?.company).toBe("Example Labs");
    copy.close();

    const again = await js(["data-migrate", "--from", home, "--to", target, "--yes"]);
    expect(again.code).toBe(5);
  });
});

describe("triage and rank", () => {
  test("triage combines fit, market, template and projects without echoing the JD", async () => {
    const { stdout } = await js(["triage", "--job", join(home, "data", "jd", "platform.txt")]);
    const { data } = parse(stdout);
    expect(data.fit.matched).toEqual(expect.arrayContaining(["python", "terraform"]));
    expect(data.fit.gaps).toContain("kubernetes");
    expect(data.templates.cv).toBeTruthy();
    expect(data.projects).toContain("delivery-pipeline");
    expect(data).not.toHaveProperty("jd");
    expect(data).not.toHaveProperty("detail");
  });

  test("--verbose adds the rationale the compact form omits", async () => {
    const { stdout } = await js(["triage", "--job", join(home, "data", "jd", "platform.txt"), "--verbose"]);
    expect(parse(stdout).data.detail.cvRanking[0].factors.length).toBeGreaterThan(0);
  });

  test("rank defaults to the workspace's saved postings and emits NDJSON best-first", async () => {
    const { code, stdout } = await js(["rank"]);
    expect(code).toBe(0);
    const rows = stdout.trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.file)).toEqual(["platform.txt", "unrelated.md"]);
    expect(rows[0].score).toBeGreaterThan(rows[1].score);
    expect((await js(["rank", "--limit", "1"])).stdout.trim().split("\n")).toHaveLength(1);
    expect((await js(["rank", "--limit", "lots"])).code).toBe(2);
  });
});

describe("application pipeline", () => {
  test("prepare returns the brief, selected templates and convention-named paths in one call", async () => {
    const { code, stdout } = await js(["prepare", "--company", "Acme", "--role", "Platform Engineer", "--job", join(home, "data", "jd", "platform.txt")]);
    expect(code).toBe(0);
    const { data } = parse(stdout);
    expect(typeof data.brief.prompt).toBe("string");
    expect(data.templates.cv).toBeTruthy();
    expect(data.paths.cv).toMatch(/_Acme_Platform-Engineer_CV\.typ$/);
  });

  test("review passes a valid draft with exit 0", async () => {
    const { code, stdout } = await js(["review", "--draft", join(dir, "draft.json"), "--job", join(home, "data", "jd", "platform.txt")]);
    expect(parse(stdout).data.pass).toBe(true);
    expect(code).toBe(0);
  });

  test("review of a draft with an unsupported number is a negative verdict (exit 1), not an error", async () => {
    const draft = validApplicationDraft();
    draft.cv.summary.text = `${draft.cv.summary.text} Cut deployment time by 73%.`;
    writeFileSync(join(dir, "bad-draft.json"), JSON.stringify(draft));
    const { code, stdout } = await js(["review", "--draft", join(dir, "bad-draft.json"), "--job", join(home, "data", "jd", "platform.txt")]);
    const out = parse(stdout);
    expect(out.ok).toBe(true);
    expect(out.data.pass).toBe(false);
    expect(code).toBe(1);
  });

  test("render refuses without --yes and previews with --dry-run", async () => {
    const args = ["render", "--draft", join(dir, "draft.json"), "--job", join(home, "data", "jd", "platform.txt")];
    const refused = await js(args);
    expect(refused.code).toBe(2);
    expect(parse(refused.stdout).error.type).toBe("confirmation_required");
    const preview = await js([...args, "--dry-run"]);
    expect(preview.code).toBe(10);
    expect(existsSync(join(home, "assets", "applications"))).toBe(false);
  });

  test("gate without documents is a negative verdict with failing gates listed", async () => {
    const { code, stdout } = await js(["gate", "--company", "Nobody", "--role", "Nothing"]);
    const { data } = parse(stdout);
    expect(code).toBe(1);
    expect(data.pass).toBe(false);
    expect(data.submissionReady).toBe(false);
    expect(data.documents[0].failing.length).toBeGreaterThan(0);
  });

  test("gate needs --file or --company with --role", async () => {
    expect((await js(["gate", "--company", "Acme"])).code).toBe(2);
  });
});

describe("tracker", () => {
  test("tracker-list returns compact rows", async () => {
    const { code, stdout } = await js(["tracker-list"]);
    expect(code).toBe(0);
    const { data } = parse(stdout);
    expect(data.applications[0]).toEqual({ id: "app_20260901_example-labs", date: "2026-09-01", company: "Example Labs", role: "Platform Engineer", status: "applied", fit: null });
  });

  test("tracker-add refuses without --yes, previews with --dry-run, writes with --yes, conflicts on repeat", async () => {
    const args = ["tracker-add", "--company", "Contoso", "--role", "Cloud Security Engineer", "--fit", "71"];
    expect(parse((await js(args)).stdout).error.type).toBe("confirmation_required");
    expect((await js([...args, "--dry-run"])).code).toBe(10);
    const created = await js([...args, "--yes"]);
    expect(created.code).toBe(0);
    expect(parse(created.stdout).data.created.company).toBe("Contoso");
    expect((await js([...args, "--yes"])).code).toBe(5);
  });

  test("tracker-status: refuse, dry-run, apply, idempotent repeat, unknown id", async () => {
    const id = "app_20260901_example-labs";
    expect(parse((await js(["tracker-status", "--id", id, "--status", "interviewing"])).stdout).error.type).toBe("confirmation_required");
    const preview = await js(["tracker-status", "--id", id, "--status", "interviewing", "--dry-run"]);
    expect(preview.code).toBe(10);
    expect(parse(preview.stdout).data).toMatchObject({ from: "applied", to: "interviewing", dryRun: true });
    const applied = await js(["tracker-status", "--id", id, "--status", "interviewing", "--yes"]);
    expect(parse(applied.stdout).data.changed).toBe(true);
    const again = await js(["tracker-status", "--id", id, "--status", "interviewing", "--yes"]);
    expect(parse(again.stdout).data.changed).toBe(false);
    expect((await js(["tracker-status", "--id", "app_20260901_nobody", "--status", "rejected", "--yes"])).code).toBe(3);
  });
});

describe("agent alias", () => {
  test("scripts/agent.ts still answers for one release", async () => {
    const proc = Bun.spawnSync([process.execPath, join(ROOT, "scripts/agent.ts"), "--help-json"], { env: { ...process.env, JOB_SEARCH_HOME: home } });
    expect(proc.exitCode).toBe(0);
    expect(JSON.parse(proc.stdout.toString()).name).toBe("jobsearch");
  });
});

// jobsearch-plugin#16: an unsupported flag on a delegated tool escaped as a raw
// Bun TypeError and stack trace instead of the JSON error tools document.
describe("delegated tool argument errors", () => {
  test("an unsupported flag is a JSON BAD_ARGS error with exit 2", async () => {
    const { code, stdout, stderr } = await js(["run", "profile:check", "--profile", "nonexistent-profile.json"]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    const err = JSON.parse(stderr.trim());
    expect(err).toMatchObject({ code: "BAD_ARGS" });
    expect(err.error).toContain("--profile");
    expect(stderr).not.toContain("TypeError");
  });

  test("supported flags still work", async () => {
    const { code, stdout } = await js(["run", "profile:check", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("--check");
  });
});
