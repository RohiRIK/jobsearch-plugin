import { test, expect } from "bun:test";
import { mkdtempSync, existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("portfolio command previews the upload format without writing", () => {
  const dir = mkdtempSync(join(tmpdir(), "portfolio-command-"));
  try {
    const out = join(dir, "document.pdf");
    const result = Bun.spawnSync([process.execPath, "scripts/jobsearch.ts", "portfolio", "--out", out, "--format", "pdf", "--dry-run"], { cwd: import.meta.dir + "/..", env: { ...process.env, JOB_SEARCH_HOME: dir }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, result.stderr.toString()).toBe(10);
    const body = JSON.parse(result.stdout.toString());
    expect(body.data.format).toBe("pdf");
    expect(existsSync(out)).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("portfolio command applies its declared about-template default", () => {
  const dir = mkdtempSync(join(tmpdir(), "portfolio-default-"));
  try {
    const input = join(dir, "profile.json"), out = join(dir, "portfolio.html");
    writeFileSync(input, JSON.stringify({ identity: { name: "Synthetic Candidate" } }));
    const result = Bun.spawnSync([process.execPath, "scripts/jobsearch.ts", "portfolio", "--profile", input, "--out", out, "--yes"], { cwd: import.meta.dir + "/..", env: { ...process.env, JOB_SEARCH_HOME: dir }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(JSON.parse(result.stdout.toString()).data.template).toBe("about");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("portfolio refuses to use the source profile as its output document", () => {
  const dir = mkdtempSync(join(tmpdir(), "portfolio-input-safety-"));
  try {
    const input = join(dir, "profile.json"), before = JSON.stringify({ identity: { name: "Synthetic Candidate" } });
    writeFileSync(input, before);
    const result = Bun.spawnSync([process.execPath, "scripts/generate/portfolio.ts", "--profile", input, "--out", input], { cwd: import.meta.dir + "/..", env: { ...process.env, JOB_SEARCH_HOME: dir }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).not.toBe(0);
    expect(readFileSync(input, "utf8")).toBe(before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
