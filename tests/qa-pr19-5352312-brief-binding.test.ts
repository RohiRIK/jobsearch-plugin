/**
 * QA @ 5352312 F1: a critique is bound to the draft AND the brief it was
 * scored against, so it cannot be replayed against another posting or profile.
 * Every example below is synthetic test data for the fixture persona.
 */
import { describe, expect, test } from "bun:test";
import { buildApplicationBrief, reviewApplicationDraft, type ApplicationDraft } from "../src/application-draft.js";
import { CRITIQUE_SECTIONS, critiqueDraft, criticCriteria, draftDigest, type CritiqueResult } from "../src/critique.js";
import { applicationPosting, applicationProfile, validApplicationDraftV2 } from "./fixtures/application.js";

const brief = buildApplicationBrief({ profile: applicationProfile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
const draft = validApplicationDraftV2() as ApplicationDraft;
const answer = (digest: string): CritiqueResult => ({
  version: 1,
  draftDigest: digest,
  sections: CRITIQUE_SECTIONS.filter((section) => section !== "projects" || draft.cv.projects.length > 0).map((section) => ({
    section,
    scores: Object.fromEntries(criticCriteria(section).map((criterion) => [criterion.id, 5])),
    failingPatterns: [],
    rewriteHint: "",
  })),
});

describe("critique is bound to the brief (QA F1 @ 5352312)", () => {
  const scored = answer(draftDigest(draft, brief));

  test("the same brief still ships", () => {
    expect(critiqueDraft(draft, brief, reviewApplicationDraft(draft, brief), scored, 0).critique.next.action).toBe("ship");
  });

  const otherPosting = buildApplicationBrief({ profile: applicationProfile, posting: `${applicationPosting}\nAlso: on-call rotation for the payments platform.`, company: "Acme", role: "Platform Engineer" });
  const profile = structuredClone(applicationProfile);
  profile.experience![0].achievements = [`${profile.experience![0].achievements![0]} (edited)`];
  const otherProfile = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });

  test.each([
    ["another posting", otherPosting],
    ["another profile", otherProfile],
  ])("replaying it against %s is CRITIQUE_INVALID", (_name, other) => {
    const result = critiqueDraft(draft, other, reviewApplicationDraft(draft, other), scored, 0);
    expect(result.critique.status).toBe("invalid");
    expect(result.critique.next.action).not.toBe("ship");
    expect(result.review.findings.map((finding) => finding.code)).toContain("CRITIQUE_INVALID");
  });

  test("a draft-only digest no longer validates once a brief is known", () => {
    expect(draftDigest(draft, brief)).not.toBe(draftDigest(draft));
    expect(critiqueDraft(draft, brief, reviewApplicationDraft(draft, brief), answer(draftDigest(draft)), 0).critique.status).toBe("invalid");
  });
});
