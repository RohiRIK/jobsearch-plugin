/**
 * QA @ 5352312: tests that kill the surviving mutants of the PR 4 follow-up
 * (digest coverage, render --critique plumbing, +. figures, legacy briefs).
 * Every example below is synthetic test data for the fixture persona.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildApplicationBrief, reviewApplicationDraft, type ApplicationDraft } from "../src/application-draft.js";
import { CRITIQUE_SECTIONS, criticCriteria, draftDigest, type CritiqueResult } from "../src/critique.js";
import { applicationPosting, applicationProfile, validApplicationDraft, validApplicationDraftV2 } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");
const brief = buildApplicationBrief({ profile: applicationProfile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });

function answer(draft: ApplicationDraft, score = 5, digest = draftDigest(draft, brief)): CritiqueResult {
  return {
    version: 1,
    draftDigest: digest,
    sections: CRITIQUE_SECTIONS.filter((section) => section !== "projects" || draft.cv.projects.length > 0).map((section) => ({
      section,
      scores: Object.fromEntries(criticCriteria(section).map((criterion) => [criterion.id, score])),
      failingPatterns: [],
      rewriteHint: "",
    })),
  };
}

describe("the digest covers every part of the draft", () => {
  const base = validApplicationDraftV2() as ApplicationDraft;
  test.each([
    ["cover letter text", (d: ApplicationDraft) => { d.coverLetter.paragraphs[0].text += " Truly."; }],
    ["cover letter evidence", (d: ApplicationDraft) => { d.coverLetter.paragraphs[0].evidenceIds = ["job:posting"]; }],
    ["closing", (d: ApplicationDraft) => { d.coverLetter.closing = "Best,"; }],
    ["strategy thesis", (d: ApplicationDraft) => { d.strategy.roleThesis += " Now."; }],
    ["honest gaps", (d: ApplicationDraft) => { d.strategy.honestGaps = []; }],
    ["company", (d: ApplicationDraft) => { d.company = "Other Co"; }],
    ["role", (d: ApplicationDraft) => { d.role = "Staff Engineer"; }],
    ["bullet evidence", (d: ApplicationDraft) => { d.cv.experience[0].bullets[0].evidenceIds = ["profile:skill:0:0"]; }],
  ] as const)("changing the %s changes the digest", (_name, change) => {
    const changed = structuredClone(base);
    change(changed);
    expect(draftDigest(changed)).not.toBe(draftDigest(base));
  });
});

describe("render --critique plumbing", () => {
  let dir: string;
  let home: string;
  let paths: { job: string; draft: string; low: string; stale: string };
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "qa-render-critique-"));
    home = join(dir, "home");
    const draft = validApplicationDraftV2() as ApplicationDraft;
    const older = structuredClone(draft);
    older.coverLetter.closing = "Best,";
    paths = { job: join(dir, "job.txt"), draft: join(dir, "draft.json"), low: join(dir, "low.json"), stale: join(dir, "stale.json") };
    writeFileSync(paths.job, applicationPosting);
    writeFileSync(paths.draft, JSON.stringify(draft));
    writeFileSync(paths.low, JSON.stringify(answer(draft, 2)));
    writeFileSync(paths.stale, JSON.stringify(answer(older)));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const prepare = (name: string) => {
    const out = join(dir, name);
    mkdirSync(join(out, "data"), { recursive: true });
    writeFileSync(join(out, "data", "profile.json"), JSON.stringify(applicationProfile));
    return out;
  };
  const wrote = (out: string) => existsSync(join(out, "assets")) && readdirSync(join(out, "assets"), { recursive: true }).some((name) => String(name).endsWith(".typ"));
  const run = (script: string, out: string, args: string[], stdin?: string) =>
    Bun.spawnSync([process.execPath, join(ROOT, script), ...args], { env: { ...process.env, JOB_SEARCH_HOME: out, TRACKER_DB: "" }, stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin) });
  const common = ["--layout", "modern", "--date", "2026-01-15", "--force"];

  test("application render honours --round: a low critique on the last round reports", () => {
    const out = prepare("round");
    const result = run("scripts/generate/application.ts", out, ["render", "--draft", paths.draft, "--job", paths.job, ...common, "--critique", paths.low, "--round", "2"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.toString()).critique.next.action).toBe("report");
    expect(wrote(out)).toBe(false);
  });

  test("an empty --critique path fails closed, never renders", () => {
    const out = prepare("empty");
    const result = run("scripts/generate/application.ts", out, ["render", "--draft", paths.draft, "--job", paths.job, ...common, "--critique", ""]);
    expect(result.exitCode).not.toBe(0);
    expect(wrote(out)).toBe(false);
  });

  test("--critique - with --draft - is refused before anything is written", () => {
    const out = prepare("stdin");
    const result = run("scripts/generate/application.ts", out, ["render", "--draft", "-", "--job", paths.job, ...common, "--critique", "-"], require("node:fs").readFileSync(paths.draft, "utf8"));
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.toString() + result.stderr.toString()).toContain("--critique cannot read stdin");
    expect(wrote(out)).toBe(false);
  });

  test("jobsearch render --yes forwards --critique: a stale critique writes nothing", () => {
    const out = prepare("js-stale");
    const result = run("scripts/jobsearch.ts", out, ["render", "--draft", paths.draft, "--job", paths.job, ...common, "--critique", paths.stale, "--yes"]);
    expect(result.exitCode).not.toBe(0);
    expect(wrote(out)).toBe(false);
  });

  test("jobsearch render --yes forwards --round", () => {
    const out = prepare("js-round");
    const result = run("scripts/jobsearch.ts", out, ["render", "--draft", paths.draft, "--job", paths.job, ...common, "--critique", paths.low, "--round", "2", "--yes"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.toString()).toContain('"report"');
    expect(wrote(out)).toBe(false);
  });
});

test("a +. figure matches its +0. evidence", () => {
  const profile = structuredClone(applicationProfile);
  profile.experience![0].achievements = ["Automated cloud environment delivery with Python and Terraform at +0.5% drift."];
  const local = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
  const draft = validApplicationDraftV2();
  draft.cv.experience[0].bullets[0].text = "Automated cloud environment delivery with Python and Terraform at +.5% drift.";
  expect(reviewApplicationDraft(draft, local).findings.map((finding) => finding.code)).not.toContain("UNSUPPORTED_NUMBER");
});

test("a legacy brief without contractVersion still accepts a v1 draft", () => {
  const legacy = { ...structuredClone(brief), contractVersion: undefined } as unknown as typeof brief;
  const codes = reviewApplicationDraft(validApplicationDraft(), legacy).findings.map((finding) => finding.code);
  expect(codes).not.toContain("CONTRACT_DOWNGRADE");
});
