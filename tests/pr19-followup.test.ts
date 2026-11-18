/**
 * PR 4 follow-up (Pat QA FAIL @ caa4ff6 S4/S5, Sam CLEAR LOW-1..3).
 * Every example below is synthetic test data for the fixture persona.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildApplicationBrief, numberTokens, reviewApplicationDraft, type ApplicationDraft } from "../src/application-draft.js";
import { CRITIQUE_SECTIONS, MAX_CRITIQUE_ROUNDS, critiqueDraft, criticCriteria, draftDigest, type CritiqueResult } from "../src/critique.js";
import { applicationPosting, applicationProfile, validApplicationDraft, validApplicationDraftV2 } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");
const brief = buildApplicationBrief({ profile: applicationProfile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });

function bulletReview(evidenceTail: string, claimTail: string) {
  const profile = structuredClone(applicationProfile);
  profile.experience![0].achievements = [`Automated cloud environment delivery with Python and Terraform ${evidenceTail}.`];
  const local = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
  const draft = validApplicationDraftV2();
  draft.cv.experience[0].bullets[0].text = `Automated cloud environment delivery with Python and Terraform ${claimTail}.`;
  return reviewApplicationDraft(draft, local).findings.map((finding) => finding.code);
}

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

describe("signs on figures (Pat S4 @ caa4ff6)", () => {
  test.each([
    ["at -40% cost", "at +40% cost", false],
    ["at \u221240% cost", "at +40% cost", false],
    ["at \u201340% cost", "at +40% cost", false],
    ["at +40% cost", "at -40% cost", false],
    ["at 40% cost", "at +40% cost", true],
    ["at +40% cost", "at +40% cost", true],
    ["at +40% cost", "at 40% cost", true],
    ["at -.5% drift", "at -.5% drift", true],
    ["at -0.5% drift", "at -.5% drift", true],
    ["at .5% drift", "at -.5% drift", false],
    ["at +.5% drift", "at -.5% drift", false],
    ["at -.5% drift", "at .5% drift", true],
  ])("evidence %p, claim %p, supported=%p", (evidenceTail, claimTail, supported) => {
    const found = bulletReview(evidenceTail, claimTail);
    if (supported) expect(found).not.toContain("UNSUPPORTED_NUMBER");
    else expect(found).toContain("UNSUPPORTED_NUMBER");
  });

  test.each([
    ["-.5%", ["-.5%"]],
    ["+.5x", ["+.5x"]],
    ["+40%", ["+40%"]],
    ["\u2212.5%", ["-.5%"]],
    ["C++40", ["40"]],
    ["40-50%", ["40", "50%"]],
    ["1+1", ["1+", "1"]],
  ])("numberTokens(%p) keeps the sign: %p", (text, expected) => {
    expect(numberTokens(text)).toEqual(expected);
  });
});

describe("critique is bound to its draft (Pat S5 @ caa4ff6)", () => {
  const draft = validApplicationDraftV2() as ApplicationDraft;
  const base = reviewApplicationDraft(draft, brief);

  test("the request carries the digest, in the envelope and the prompt", () => {
    const { critique } = critiqueDraft(draft, brief, base);
    expect(critique.draftDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(critique.draftDigest).toBe(draftDigest(draft, brief));
    expect(critique.prompt).toContain(critique.draftDigest);
    expect(critique.enforcedByRender).toBe(false);
  });

  test("a matching digest ships", () => {
    expect(critiqueDraft(draft, brief, base, answer(draft), 0).critique.next.action).toBe("ship");
  });

  test("a stale critique of another draft is CRITIQUE_INVALID, never ship", () => {
    const older = validApplicationDraftV2() as ApplicationDraft;
    older.cv.headline.text = `${older.cv.headline.text} (older)`;
    expect(draftDigest(older)).not.toBe(draftDigest(draft));
    const result = critiqueDraft(draft, brief, base, answer(older), 0);
    expect(result.critique.status).toBe("invalid");
    expect(result.critique.next.action).not.toBe("ship");
    expect(result.review.pass).toBe(false);
    expect(result.review.findings.map((finding) => finding.code)).toContain("CRITIQUE_INVALID");
  });

  test("a missing or malformed digest is invalid", () => {
    const { draftDigest: _omit, ...missing } = answer(draft);
    expect(critiqueDraft(draft, brief, base, missing, 0).critique.status).toBe("invalid");
    expect(critiqueDraft(draft, brief, base, answer(draft, 5, "abc"), 0).critique.status).toBe("invalid");
  });
});

describe("round clamp fails toward fewer rounds (Sam LOW-3)", () => {
  const draft = validApplicationDraftV2() as ApplicationDraft;
  const base = reviewApplicationDraft(draft, brief);
  test.each([Number.NaN, 2.5, Number.POSITIVE_INFINITY, "1" as unknown as number, 1e9])("round %p counts as the last round and reports", (round) => {
    const { critique } = critiqueDraft(draft, brief, base, answer(draft, 2), round);
    expect(critique.round).toBe(MAX_CRITIQUE_ROUNDS);
    expect(critique.next.action).toBe("report");
  });
});

test("CONTRACT_DOWNGRADE: a v1 draft against a v2 brief fails review (Sam LOW-2)", () => {
  const result = reviewApplicationDraft(validApplicationDraft(), brief);
  expect(result.pass).toBe(false);
  expect(result.findings).toContainEqual(expect.objectContaining({ severity: "error", code: "CONTRACT_DOWNGRADE" }));
});

describe("render --critique gates the write (Sam LOW-1)", () => {
  let dir: string;
  let paths: { job: string; draft: string; good: string; low: string; stale: string; broken: string };
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "render-critique-"));
    mkdirSync(join(dir, "home", "data"), { recursive: true });
    writeFileSync(join(dir, "home", "data", "profile.json"), JSON.stringify(applicationProfile));
    const draft = validApplicationDraftV2() as ApplicationDraft;
    const older = validApplicationDraftV2() as ApplicationDraft;
    older.cv.headline.text = `${older.cv.headline.text} (older)`;
    paths = { job: join(dir, "job.txt"), draft: join(dir, "draft.json"), good: join(dir, "good.json"), low: join(dir, "low.json"), stale: join(dir, "stale.json"), broken: join(dir, "broken.json") };
    writeFileSync(paths.job, applicationPosting);
    writeFileSync(paths.draft, JSON.stringify(draft));
    writeFileSync(paths.good, JSON.stringify(answer(draft)));
    writeFileSync(paths.low, JSON.stringify(answer(draft, 2)));
    writeFileSync(paths.stale, JSON.stringify(answer(older)));
    writeFileSync(paths.broken, "{not json");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const render = (out: string, extra: string[]) =>
    Bun.spawnSync([process.execPath, join(ROOT, "scripts/generate/application.ts"), "render", "--draft", paths.draft, "--job", paths.job, "--layout", "modern", "--date", "2026-01-15", "--force", ...extra], {
      env: { ...process.env, JOB_SEARCH_HOME: join(dir, out) },
    });
  const wrote = (out: string) => existsSync(join(dir, out, "assets")) && readdirSync(join(dir, out, "assets"), { recursive: true }).some((name) => String(name).endsWith(".typ"));
  const prepareHome = (out: string) => {
    mkdirSync(join(dir, out, "data"), { recursive: true });
    writeFileSync(join(dir, out, "data", "profile.json"), JSON.stringify(applicationProfile));
  };

  test.each([
    ["low", "regenerate"],
    ["stale", "critique"],
    ["broken", "critique"],
  ] as const)("a %p critique writes nothing (next.action %p)", (kind, action) => {
    const out = `home-${kind}`;
    prepareHome(out);
    const result = render(out, ["--critique", paths[kind]]);
    expect(result.exitCode).toBe(1);
    const data = JSON.parse(result.stdout.toString());
    expect(data.written).toBe(false);
    expect(data.critique.next.action).toBe(action);
    expect(wrote(out)).toBe(false);
  });

  test("a passing critique of this draft renders", () => {
    prepareHome("home-good");
    const result = render("home-good", ["--critique", paths.good]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.toString()).written).toBe(true);
  });

  test("without --critique, render stays advisory and still renders", () => {
    prepareHome("home-none");
    const result = render("home-none", []);
    expect(result.exitCode).toBe(0);
  });
});

describe("Sam's 5352312 LOWs", () => {
  test("LOW-1: a copied duty the bullet cites is flagged even when a cited achievement contains it", () => {
    const duty = "Maintained deployment tooling with the security team.";
    for (const achievement of [`${duty} Cut release time for every product team.`, duty]) {
      const profile = structuredClone(applicationProfile);
      profile.experience![0].achievements = [achievement];
      const local = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
      const draft = validApplicationDraftV2();
      draft.cv.experience[0].bullets[1] = { text: duty, evidenceIds: ["profile:experience:0:responsibility:0", "profile:experience:0:achievement:0"] };
      expect(reviewApplicationDraft(draft, local).findings).toContainEqual(expect.objectContaining({ severity: "error", code: "RAW_PARAPHRASE", path: "cv.experience.0.bullets.1" }));
    }
  });

  test("LOW-1: restating a cited achievement as written is still allowed", () => {
    const result = reviewApplicationDraft(validApplicationDraftV2(), brief);
    expect(result.findings.filter((finding) => finding.path === "cv.experience.0.bullets.0").map((finding) => finding.code)).not.toContain("RAW_PARAPHRASE");
  });

  test.each([
    ["at 20% cost", "at +-20% cost", false],
    ["at -20% cost", "at +-20% cost", true],
    ["at 20% cost", "at 20% cost", true],
  ])("LOW-2: evidence %p, claim %p, supported=%p", (evidenceTail, claimTail, supported) => {
    const found = bulletReview(evidenceTail, claimTail);
    if (supported) expect(found).not.toContain("UNSUPPORTED_NUMBER");
    else expect(found).toContain("UNSUPPORTED_NUMBER");
  });

  test.each([
    ["+-20%", ["-20%"]],
    ["C++40", ["40"]],
    ["C++-20%", ["20%"]],
  ])("LOW-2: numberTokens(%p) = %p", (text, expected) => {
    expect(numberTokens(text)).toEqual(expected);
  });
});
