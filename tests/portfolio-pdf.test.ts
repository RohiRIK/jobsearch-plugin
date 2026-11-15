import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { exportPortfolioPdf } from "../src/portfolio-pdf.js";

// Exercises the public generator, not a mocked Chromium wrapper.
test("portfolio --format pdf produces a real PDF retaining all approved credential and project text", () => {
  const dir = mkdtempSync(join(tmpdir(), "portfolio-export-test-"));
  try {
    const profile = {
      identity: { name: "Synthetic Candidate", email: "candidate@example.test" },
      education: [{ degree: "Specialist Training", field: "Security Engineering", institution: "Example Academy", startYear: 2021, endYear: 2022 }],
      certifications: [{ name: "Example Security Certificate", date: "2023" }],
      skills: [{ category: "Automation", skills: ["PowerShell", "Python"] }],
      projects: [{ slug: "verified-flow", name: "Verified Lifecycle Flow", kind: "work", summary: "Creates and disables accounts from confirmed lifecycle events.", domains: [], stack: ["PowerShell"], disclosure: "approved", link: "https://example.test/verified-flow" }],
    };
    const input = join(dir, "profile.json"), output = join(dir, "portfolio.pdf");
    writeFileSync(input, JSON.stringify(profile));
    const before = readFileSync(input);
    const result = Bun.spawnSync([process.execPath, "scripts/generate/portfolio.ts", "--template", "showcase", "--profile", input, "--out", output, "--format", "pdf"], { cwd: import.meta.dir + "/..", env: { ...process.env, JOB_SEARCH_HOME: dir }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(readFileSync(output).subarray(0, 5).toString()).toBe("%PDF-");
    const text = Bun.spawnSync(["pdftotext", output, "-"], { stdout: "pipe", stderr: "pipe" });
    expect(text.exitCode).toBe(0);
    const extracted = text.stdout.toString().replace(/\s+/g, " ");
    for (const required of ["Verified Lifecycle Flow", "Example Security Certificate", "Example Academy", "Specialist Training", "PowerShell", "Python"]) expect(extracted).toContain(required);
    const links = Bun.spawnSync(["pdfinfo", "-url", output], { stdout: "pipe", stderr: "pipe" });
    expect(links.exitCode).toBe(0);
    expect(links.stdout.toString()).toContain("https://example.test/verified-flow");
    expect(readFileSync(input)).toEqual(before);
    const receipt = JSON.parse(result.stdout.toString());
    expect(receipt.format).toBe("pdf");
    expect(receipt.pdf.pages).toBeGreaterThan(0);
    expect(receipt.pdf.preservationChecked).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 120_000);

test("PDF inspection refuses missing content without overwriting the last good output", () => {
  const dir = mkdtempSync(join(tmpdir(), "portfolio-preserve-test-"));
  try {
    const output = join(dir, "last-good.pdf"), before = Buffer.from("previous approved PDF sentinel");
    writeFileSync(output, before);
    expect(() => exportPortfolioPdf("<!doctype html><html><head></head><body><p>Available content</p></body></html>", output, ["Missing credential sentinel"])).toThrow("lost required content");
    expect(readFileSync(output)).toEqual(before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 120_000);

test("PDF dependency error identifies the specific missing tools", () => {
  const dir = mkdtempSync(join(tmpdir(), "portfolio-missing-tools-"));
  const previous = process.env.JOB_SEARCH_BIN_PATH;
  try {
    const browser = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"].map(name => Bun.which(name)).find(Boolean)!;
    expect(browser).toBeDefined();
    symlinkSync(browser, join(dir, "chromium"));
    process.env.JOB_SEARCH_BIN_PATH = dir;
    expect(() => exportPortfolioPdf("<html><head></head><body>Text</body></html>", join(dir, "out.pdf"), ["Text"])).toThrow("Missing: pdfinfo, pdftotext");
  } finally {
    if (previous === undefined) delete process.env.JOB_SEARCH_BIN_PATH;
    else process.env.JOB_SEARCH_BIN_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Chromium failure retains the initial sandbox diagnostic and the last good PDF", () => {
  const dir = mkdtempSync(join(tmpdir(), "portfolio-browser-error-"));
  const previous = process.env.JOB_SEARCH_BIN_PATH;
  try {
    const browser = join(dir, "chromium"), output = join(dir, "last-good.pdf");
    writeFileSync(browser, `#!/bin/sh\nprintf 'No usable sandbox: diagnostic sentinel\\n' >&2\nprintf '${"x".repeat(3000)}' >&2\nexit 1\n`);
    chmodSync(browser, 0o700);
    for (const name of ["pdfinfo", "pdftotext"]) symlinkSync(Bun.which(name)!, join(dir, name));
    writeFileSync(output, "last-good sentinel");
    process.env.JOB_SEARCH_BIN_PATH = dir;
    expect(() => exportPortfolioPdf("<html><head></head><body>Text</body></html>", output, [])).toThrow("No usable sandbox: diagnostic sentinel");
    expect(readFileSync(output, "utf8")).toBe("last-good sentinel");
  } finally {
    if (previous === undefined) delete process.env.JOB_SEARCH_BIN_PATH;
    else process.env.JOB_SEARCH_BIN_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("portfolio print blocks inline document scripts instead of executing them", () => {
  const dir = mkdtempSync(join(tmpdir(), "portfolio-script-test-"));
  try {
    const output = join(dir, "safe.pdf");
    const html = '<!doctype html><html><head></head><body><p>Safe portfolio text</p><script>document.body.innerHTML="UNTRUSTED SCRIPT EXECUTED"</script></body></html>';
    expect(exportPortfolioPdf(html, output, ["Safe portfolio text"]).preservationChecked).toBe(true);
    const text = Bun.spawnSync(["pdftotext", output, "-"], { stdout: "pipe" }).stdout.toString();
    expect(text).not.toContain("UNTRUSTED SCRIPT EXECUTED");
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 120_000);
