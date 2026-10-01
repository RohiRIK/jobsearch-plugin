import { describe, expect, test } from "bun:test";
import { buildApplicationBrief, reviewApplicationDraft } from "../src/application-draft.js";
import { applicationPosting, applicationProfile, validApplicationDraft } from "./fixtures/application.js";

 describe("application plan", () => {
  test("makes the role thesis, proof requirements, evidence order, and budget explicit", () => {
    const brief = buildApplicationBrief({
      profile: applicationProfile,
      posting: applicationPosting,
      company: "Acme",
      role: "Platform Engineer",
    });

    expect(brief.plan.roleThesis).toContain("Platform Engineer");
    expect(brief.plan.mustProve).toContain("Python");
    expect(brief.plan.evidencePriorities[0]).toMatchObject({
      evidenceId: "profile:experience:0",
      classification: "professional-experience",
      priority: 1,
    });
    expect(brief.plan.projectDecisions.find((item) => item.slug === "delivery-pipeline")).toMatchObject({
      classification: "work-project",
      included: true,
    });
    expect(brief.plan.contentBudget).toMatchObject({ summaryWords: [40, 65], projects: 1 });
  });

  test("keeps unreviewed and restricted projects out of application evidence", () => {
    const profile = structuredClone(applicationProfile);
    profile.projects![0].disclosure = "unreviewed";
    const brief = buildApplicationBrief({
      profile,
      posting: applicationPosting,
      company: "Acme",
      role: "Platform Engineer",
    });

    expect(brief.plan.projectDecisions.find((item) => item.slug === "delivery-pipeline")?.included).toBe(false);
    expect(brief.evidence.some((item) => item.id === "profile:project:delivery-pipeline")).toBe(false);
  });

  test("rejects a draft whose strategy points at unknown evidence", () => {
    const brief = buildApplicationBrief({
      profile: applicationProfile,
      posting: applicationPosting,
      company: "Acme",
      role: "Platform Engineer",
    });
    const draft = validApplicationDraft();
    draft.strategy.evidencePriorities[0].evidenceId = "profile:experience:999";
    const review = reviewApplicationDraft(draft, brief);

    expect(review.pass).toBe(false);
    expect(review.findings.map((finding) => finding.code)).toContain("UNKNOWN_PRIORITY_EVIDENCE");
  });
});
