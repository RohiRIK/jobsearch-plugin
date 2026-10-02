import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CvLayoutOption } from "../src/cv-options.js";
import { fitReport } from "../scripts/generate/fit.js";

const ROOT = resolve(import.meta.dir, "..");
let dir: string;

// Page fill must not depend on the fonts a machine has, so each "layout" is a
// stack of solid blocks with a known height (cm) per page.
const PAGES: Record<string, number[]> = {
  chosen: [25, 2], // second page nearly empty
  dense: [25, 20], // two well-filled pages
  long: [25, 25, 6], // three pages: over a 1-2 page budget
};
const source = (layout: string) =>
  `#set page(paper: "a4", margin: 2cm)\n${PAGES[layout].map((h, i) => `${i ? "#pagebreak()\n" : ""}#rect(width: 100%, height: ${h}cm, fill: luma(40))`).join("\n")}\n`;
const option = (id: string, density: CvLayoutOption["density"]): CvLayoutOption =>
  ({ id, name: id, description: id, bestFor: [], avoidFor: [], density, accent: "blue", supportsAvatar: false });

beforeAll(() => {
  mkdirSync(join(ROOT, "data", "scratch"), { recursive: true });
  dir = mkdtempSync(join(ROOT, "data", "scratch", "fit-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Issue #7: two executive CVs left only the certifications on page 2. --fit
// reports which layouts would fit instead of leaving the user to guess.
describe("render --fit", () => {
  test("reports the layouts that fit, densest first, and changes nothing", async () => {
    const cvPath = join(dir, "Jane-Doe_Acme_Engineer_CV.typ");
    writeFileSync(cvPath, source("chosen"));
    const before = readFileSync(cvPath, "utf-8");
    const report = await fitReport({
      render: source,
      cvPath,
      chosen: "chosen",
      budget: [1, 2],
      layouts: [option("chosen", "roomy"), option("long", "balanced"), option("dense", "compact")],
    });
    expect(report.chosen).toMatchObject({ layout: "chosen", pages: 2, underfilled: true, fits: false });
    expect(report.alternatives.map((t) => t.layout)).toEqual(["dense", "long"]);
    expect(report.alternatives[0]).toMatchObject({ pages: 2, underfilled: false, withinBudget: true, fits: true });
    expect(report.alternatives[1]).toMatchObject({ pages: 3, withinBudget: false, fits: false });
    expect(report.suggestion).toContain("dense (2 p)");
    expect(report.suggestion).toContain("nothing was changed");
    expect(readFileSync(cvPath, "utf-8")).toBe(before);
    expect(readdirSync(dir).filter((f) => f.startsWith(".fit-"))).toEqual([]);
  }, 60_000);

  test("a layout that already fits is not second-guessed", async () => {
    const cvPath = join(dir, "Jane-Doe_Acme_Engineer2_CV.typ");
    writeFileSync(cvPath, source("dense"));
    const report = await fitReport({ render: source, cvPath, chosen: "dense", budget: [1, 2], layouts: [option("dense", "compact"), option("chosen", "roomy")] });
    expect(report.chosen.fits).toBe(true);
    expect(report.alternatives).toEqual([]);
  }, 60_000);

  test("when nothing fits it says so and never suggests padding or deleting facts", async () => {
    const cvPath = join(dir, "Jane-Doe_Acme_Engineer3_CV.typ");
    writeFileSync(cvPath, source("chosen"));
    const report = await fitReport({ render: source, cvPath, chosen: "chosen", budget: [1, 2], layouts: [option("chosen", "roomy"), option("long", "balanced")] });
    expect(report.alternatives.every((t) => !t.fits)).toBe(true);
    expect(report.suggestion).toContain("no layout fits");
    expect(report.suggestion).toContain("never pad or drop a true fact");
  }, 60_000);
});

describe("jobsearch render --fit", () => {
  test("adds a fit report to render's output and leaves the chosen layout in place", async () => {
    const { applicationPosting, applicationProfile, validApplicationDraft } = await import("./fixtures/application.js");
    const home = join(dir, "home");
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(join(home, "data", "profile.json"), JSON.stringify(applicationProfile));
    writeFileSync(join(dir, "job.txt"), applicationPosting);
    writeFileSync(join(dir, "draft.json"), JSON.stringify(validApplicationDraft()));
    const proc = Bun.spawnSync([process.execPath, join(ROOT, "scripts/jobsearch.ts"), "render", "--draft", join(dir, "draft.json"), "--job", join(dir, "job.txt"), "--layout", "executive", "--fit", "--yes"], {
      env: { ...process.env, JOB_SEARCH_HOME: home, TRACKER_DB: "", JOB_SEARCH_TELEMETRY: "0" },
    });
    const out = JSON.parse(proc.stdout.toString());
    expect(out.ok).toBe(true);
    expect(out.data.fit.chosen.layout).toBe("executive");
    expect(typeof out.data.fit.suggestion).toBe("string");
    expect(readFileSync(join(home, out.data.files.cv), "utf-8")).toContain('layout: "executive"');
  }, 180_000);
});
