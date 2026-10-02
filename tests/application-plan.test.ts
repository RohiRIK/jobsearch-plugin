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

  // Issue #12: a brief listed Rails as a gap and also told the writer to lead
  // with evidence proving Rails.
  test("never asks the writer to prove a requirement the evidence does not support", () => {
    const posting = "Senior Rails Engineer. Requirements: Ruby on Rails, Python, Terraform. Build delivery automation.";
    const brief = buildApplicationBrief({ profile: applicationProfile, posting, company: "Acme", role: "Senior Rails Engineer" });
    const gaps = brief.gaps.map((gap) => gap.toLowerCase());
    expect(gaps.some((gap) => gap.includes("rails"))).toBe(true);
    for (const skill of brief.plan.mustProve) expect(gaps).not.toContain(skill.toLowerCase());
    expect(brief.plan.roleThesis).not.toMatch(/proves (ruby on )?rails/i);
    expect(brief.plan.roleThesis).toMatch(/proves (Python|Terraform)/);
    expect(brief.plan.openGaps.join(" ")).toMatch(/rails/i);
    expect(brief.plan.roleThesis).toMatch(/honest gaps or transferable experience/);
  });

  test("with no supported top requirement the thesis leads with relevant experience, not a gap", () => {
    const posting = "Pastry Chef. Requirements: French pastry, lamination, sourdough.";
    const brief = buildApplicationBrief({ profile: applicationProfile, posting, company: "Boulangerie", role: "Pastry Chef" });
    expect(brief.plan.mustProve).toEqual([]);
    expect(brief.plan.roleThesis).not.toMatch(/proves/);
    expect(brief.plan.roleThesis).toMatch(/do not imply the missing skills/);
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
