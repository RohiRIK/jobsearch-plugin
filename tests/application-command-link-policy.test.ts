import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applicationProfile, applicationPosting, validApplicationDraftV2 } from "./fixtures/application.js";

test("public render command forwards project-link policy through the bundled tool contract", () => {
  const dir = mkdtempSync(join(tmpdir(), "application-command-links-"));
  try {
    const profile = join(dir, "profile.json"), job = join(dir, "job.txt"), draftPath = join(dir, "draft.json");
    const draft = validApplicationDraftV2();
    draft.cv.projects = [{ slug: "delivery-pipeline", description: { text: "Reusable deployment pipeline for platform teams.", evidenceIds: ["profile:project:delivery-pipeline"] }, highlights: [] }];
    writeFileSync(profile, JSON.stringify(applicationProfile));
    writeFileSync(job, applicationPosting);
    writeFileSync(draftPath, JSON.stringify(draft));
    const result = Bun.spawnSync([process.execPath, "scripts/jobsearch.ts", "render", "--draft", draftPath, "--job", job, "--profile", profile, "--layout", "modern", "--project-links", "off", "--links", "linkedin", "--yes"], { cwd: import.meta.dir + "/..", env: { ...process.env, JOB_SEARCH_HOME: dir, JOB_SEARCH_PLUGIN_ROOT: import.meta.dir + "/.." }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, result.stdout.toString() + result.stderr.toString()).toBe(0);
    const body = JSON.parse(result.stdout.toString());
    const cv = readFileSync(join(dir, body.data.files.cv), "utf8");
    const cl = readFileSync(join(dir, body.data.files.coverLetter), "utf8");
    expect(cv).not.toContain("https://example.com/delivery-pipeline");
    expect(cv).toContain("Delivery Pipeline");
    expect(cl).not.toContain("https://portfolio.example.com");
    expect(readFileSync(profile, "utf8")).toBe(JSON.stringify(applicationProfile));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
