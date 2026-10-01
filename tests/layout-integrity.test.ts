import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderCvTypst } from "../src/application-renderers.js";
import { resolveTypstCommand } from "../src/resolve-bin.js";
import { checkLayout } from "../scripts/verify-layout.js";
import { reevaluateDoc } from "../scripts/reevaluate.js";
import { applicationProfile, validApplicationDraft } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");
const SCRATCH = join(ROOT, "data", "scratch");
const OVERFLOW_SOURCE = join(ROOT, "tests", "fixtures", "layout-overflow.typ");
const RULE_COLLISION_SOURCE = join(ROOT, "tests", "fixtures", "layout-rule-collision.typ");

async function compile(source: string, pdf: string): Promise<void> {
  const typst = resolveTypstCommand(ROOT);
  if (!typst) throw new Error("Typst CLI not found");
  const proc = Bun.spawn([...typst, "compile", "--root", ROOT, source, pdf], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  expect(await proc.exited).toBe(0);
  expect(`${stdout}${stderr}`.includes("error:")).toBe(false);
  expect(existsSync(pdf)).toBe(true);
}

function workDir(): string {
  mkdirSync(SCRATCH, { recursive: true });
  return mkdtempSync(join(SCRATCH, "layout-test-"));
}

describe("visual layout integrity", () => {
  test("accepts a representative rendered CV inside the safe page area", async () => {
    const dir = workDir();
    try {
      const source = join(dir, "representative.typ");
      const pdf = join(dir, "representative.pdf");
      writeFileSync(source, renderCvTypst({ profile: applicationProfile, draft: validApplicationDraft(), outDir: dir, template: "modern" }));
      await compile(source, pdf);

      const report = await checkLayout(pdf, source);
      expect(report.pass).toBe(true);
      expect(report.renderer).toBe("typst");
      expect(report.pages.length).toBeGreaterThan(0);
      expect(report.pages.every((page) => page.overflowPixels === 0)).toBe(true);

      const gate = await reevaluateDoc(source, "cv", { allowMissingAts: true });
      expect(gate.gates.find((entry) => entry.gate === "compile")?.detail).toContain("current source and template imports");
      expect(gate.gates.find((entry) => entry.gate === "layout")?.pass).toBe(true);

      // The safety-only layout result stays green, but the shipping gate must
      // separately reject a page that is technically safe and visually empty.
      const density = gate.gates.find((entry) => entry.gate === "layout:density");
      expect(density?.pass).toBe(false);
      expect(density?.detail).toContain("underfilled final page");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fails when body text intersects a horizontal rule", async () => {
    const dir = workDir();
    try {
      const pdf = join(dir, "rule-collision.pdf");
      await compile(RULE_COLLISION_SOURCE, pdf);

      const report = await checkLayout(pdf, RULE_COLLISION_SOURCE);
      expect(report.pass).toBe(false);
      expect(report.pages).toHaveLength(1);
      expect(report.pages[0].overflowPixels).toBe(0);
      expect(report.pages[0].ruleCollisions.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fails when visible text reaches the physical page edge", async () => {
    const dir = workDir();
    try {
      const pdf = join(dir, "overflow.pdf");
      await compile(OVERFLOW_SOURCE, pdf);

      const report = await checkLayout(pdf, OVERFLOW_SOURCE);
      expect(report.pass).toBe(false);
      expect(report.pages).toHaveLength(1);
      expect(report.pages[0].overflowPixels).toBeGreaterThan(0);
      expect(report.pages[0].overflowBoundsPx).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
