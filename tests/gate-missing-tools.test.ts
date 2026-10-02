import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

// Issue #3: with Typst absent, the gate told agents to "fix the source errors"
// and "shorten or wrap the affected field" — edits that cannot fix a missing tool.
describe("shipping gate without a document toolchain", () => {
  let dir: string;
  let report: { documents: Array<{ gates: Array<{ gate: string; pass: boolean | null; detail: string; hint?: string }> }> };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "gate-tools-"));
    const code = join(dir, "code"); // a code root with no node_modules/typst
    mkdirSync(code);
    const doc = join(dir, "Jane-Doe_Acme_Engineer_CV.typ");
    writeFileSync(doc, "= Jane Doe\n");
    copyFileSync(join(ROOT, "tests", "fixtures", "two-page.pdf"), doc.replace(/\.typ$/, ".pdf"));
    const proc = Bun.spawnSync([process.execPath, join(ROOT, "scripts", "reevaluate.ts"), "--file", doc, "--allow-missing-ats"], {
      env: { ...process.env, JOB_SEARCH_BIN_PATH: join(dir, "no-bin"), JOB_SEARCH_PLUGIN_ROOT: code, JOB_SEARCH_HOME: dir, JOB_SEARCH_TELEMETRY: "0" },
    });
    report = JSON.parse(proc.stdout.toString());
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const gate = (name: string) => report.documents[0].gates.find((g) => g.gate === name)!;

  test("a missing compiler fails compile with an install hint, not a source-error hint", () => {
    expect(gate("compile").pass).toBe(false);
    expect(gate("compile").detail).toContain("typst not found");
    expect(gate("compile").hint).toContain("install Typst");
    expect(gate("compile").hint).not.toContain("source errors");
  });

  test("an unavailable rasterizer fails layout with an install hint, not a wrap hint", () => {
    expect(gate("layout").pass).toBe(false);
    expect(gate("layout").hint).toContain("install Typst");
    expect(gate("layout").hint).not.toContain("shorten");
  });
});
