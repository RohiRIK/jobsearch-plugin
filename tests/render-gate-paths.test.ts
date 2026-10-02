import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { applicationPosting, applicationProfile, validApplicationDraft } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");
let dir: string;
let home: string;

async function js(args: string[]) {
  const proc = Bun.spawn([process.execPath, join(ROOT, "scripts/jobsearch.ts"), ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, JOB_SEARCH_HOME: home, TRACKER_DB: "", JOB_SEARCH_TELEMETRY: "0" },
  });
  const stdout = await new Response(proc.stdout).text();
  return { code: await proc.exited, out: JSON.parse(stdout) };
}

// Issue #11: in a first-run workspace (no data/config.json) render named files
// after the profile while the company/role gate looked for unprefixed names and
// failed `exists` next to the documents it should have checked.
describe("render and gate agree on where documents live", () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "render-gate-"));
    home = join(dir, "home");
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(join(home, "data", "profile.json"), JSON.stringify(applicationProfile));
    writeFileSync(join(dir, "job.txt"), applicationPosting);
    writeFileSync(join(dir, "draft.json"), JSON.stringify(validApplicationDraft()));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("without config.json, and a day after render, the gate finds the rendered files", async () => {
    expect(existsSync(join(home, "data", "config.json"))).toBe(false);
    const render = await js(["render", "--draft", join(dir, "draft.json"), "--job", join(dir, "job.txt"), "--layout", "modern", "--date", "2026-09-30", "--yes"]);
    expect(render.code).toBe(0);
    const cv: string = render.out.data.files.cv;
    expect(cv).toContain("Alex-Rivera_Acme_");

    const gate = await js(["gate", "--company", "Acme", "--role", "Platform Engineer", "--allow-missing-ats", "--verbose"]);
    const docs = gate.out.data.documents as Array<{ file: string; gates: Array<{ gate: string; pass: boolean | null }> }>;
    expect(docs.map((d) => d.file.replace(/\.pdf$/, ".typ"))).toEqual([cv, render.out.data.files.coverLetter]);
    for (const doc of docs) {
      expect(doc.gates.find((g) => g.gate === "exists")).toBeUndefined();
      expect(doc.gates.find((g) => g.gate === "naming")?.pass).toBe(true);
    }
  }, 120_000);
});
