import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { applicationPosting, applicationProfile, validApplicationDraft } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");
let dir: string;
let profilePath: string;
let postingPath: string;
let draftPath: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "application-cli-"));
  profilePath = join(dir, "profile.json");
  postingPath = join(dir, "job.txt");
  draftPath = join(dir, "draft.json");
  writeFileSync(profilePath, JSON.stringify(applicationProfile));
  writeFileSync(postingPath, applicationPosting);
  writeFileSync(draftPath, JSON.stringify(validApplicationDraft()));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function run(args: string[]) {
  const proc = Bun.spawn([process.execPath, "run", join(ROOT, "scripts/generate/application.ts"), ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: ROOT,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe("application CLI", () => {
  test("prepare emits exactly one composable JSON prompt bundle", async () => {
    const result = await run(["prepare", "--company", "Acme", "--role", "Platform Engineer", "--job", postingPath, "--profile", profilePath]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const data = JSON.parse(result.stdout);
    expect(data.prompt).toContain("<application_context>");
    expect(Array.isArray(data.evidence)).toBe(true);
  });

  test("review returns a grounded verdict as JSON", async () => {
    const result = await run(["review", "--draft", draftPath, "--job", postingPath, "--profile", profilePath]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).pass).toBe(true);
  });

  test("unknown flags fail instead of being silently ignored", async () => {
    const result = await run(["prepare", "--unknown", "value"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARGS");
    expect(result.stdout).toBe("");
  });
});
