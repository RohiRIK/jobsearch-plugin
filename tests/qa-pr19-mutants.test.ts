/**
 * QA (PR #19 @ caa4ff6): tests that kill the non-equivalent mutants that
 * survived the PR's own suite. Each block names the mutant it pins.
 */
import { describe, expect, test } from "bun:test";
import { buildApplicationBrief, numberTokens, reviewApplicationDraft, type ApplicationDraft } from "../src/application-draft.js";
import { CRITIQUE_SECTIONS, critiqueDraft, criticCriteria, draftDigest, type CritiqueResult } from "../src/critique.js";
import { findAdjectiveStacks } from "../src/prose-checks.js";
import { applicationPosting, applicationProfile, validApplicationDraftV2 } from "./fixtures/application.js";

const brief = buildApplicationBrief({ profile: applicationProfile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
const codes = (draft: unknown, local = brief) => reviewApplicationDraft(draft, local).findings.filter((finding) => finding.severity === "error").map((finding) => finding.code);

describe("RAW_PARAPHRASE boundaries", () => {
  const withResponsibility = (line: string) => {
    const profile = structuredClone(applicationProfile);
    profile.experience![0].responsibilities = [line];
    return buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
  };
  const bulletCodes = (local: ReturnType<typeof withResponsibility>, text: string) => {
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[1] = { text, evidenceIds: ["profile:experience:0:responsibility:0"] };
    return codes(draft, local);
  };

  test("exactly 0.7 of the trigrams copied from the responsibility line fails (>=, not >)", () => {
    const local = withResponsibility("Maintained deployment tooling and release dashboards with the security team");
    expect(bulletCodes(local, "Maintained deployment tooling and release dashboards with the security finance legal groups")).toContain("RAW_PARAPHRASE");
  });

  test("exactly 0.7 of the trigrams copied from the posting fails (>=, not >)", () => {
    const posting = `${applicationPosting} Maintain deployment tooling and release dashboards with the security team.`;
    const local = buildApplicationBrief({ profile: applicationProfile, posting, company: "Acme", role: "Platform Engineer" });
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[1] = { text: "Maintain deployment tooling and release dashboards with the security finance legal groups", evidenceIds: ["profile:experience:0:achievement:0"] };
    expect(codes(draft, local)).toContain("RAW_PARAPHRASE");
  });

  test("six words are judged, five are not (RAW_PARAPHRASE_MIN_WORDS)", () => {
    expect(bulletCodes(withResponsibility("Maintained deployment tooling with security team."), "Maintained deployment tooling with security team.")).toContain("RAW_PARAPHRASE");
    expect(bulletCodes(withResponsibility("Maintained deployment tooling with security."), "Maintained deployment tooling with security.")).not.toContain("RAW_PARAPHRASE");
  });

  test("case does not hide a copy", () => {
    expect(bulletCodes(withResponsibility("Maintained deployment tooling with the security team."), "MAINTAINED DEPLOYMENT TOOLING WITH THE SECURITY TEAM.")).toContain("RAW_PARAPHRASE");
  });
});

describe("FIRST_BULLET_OFF_THESIS: alias and implied names count", () => {
  test.each([
    ["Kubernetes", "Ran Kubernetes clusters for product teams.", "Kubernetes", "Kept K8s clusters healthy for every product team."],
    ["Scripting", "Automated patching with PowerShell scripts.", "PowerShell", "Cut patch toil with PowerShell for every product team."],
  ])("mustProve[0] %p is proven by a first bullet that names it another way", (requirement, achievement, skill, bulletText) => {
    const profile = structuredClone(applicationProfile);
    profile.experience![0].achievements = [achievement, "Automated cloud environment delivery with Python and Terraform."];
    profile.skills = [{ category: "Automation", skills: ["Python", "Terraform", skill] }];
    const local = buildApplicationBrief({ profile, posting: `Platform Engineer. Requirements: ${requirement}, Python. Build secure delivery automation.`, company: "Acme", role: "Platform Engineer" });
    expect(local.plan.mustProve[0]).toBe(requirement);
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets = [{ text: bulletText, evidenceIds: ["profile:experience:0:achievement:1"] }, ...draft.cv.experience[0].bullets];
    expect(codes(draft, local)).not.toContain("FIRST_BULLET_OFF_THESIS");
  });
});

describe("cover letter: claim words, aspiration words and later hands-on verbs", () => {
  const labelBrief = (() => {
    const profile = structuredClone(applicationProfile);
    profile.skills = [{ category: "Automation", skills: ["Python", "Terraform", "Kubernetes"] }];
    return buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
  })();
  const letterCodes = (sentence: string, honestGaps = ["Kubernetes"]) => {
    const draft = validApplicationDraftV2();
    draft.coverLetter.paragraphs[1].text += ` ${sentence}`;
    draft.strategy.honestGaps = honestGaps;
    return codes(draft, labelBrief);
  };

  test.each([
    "I have not used Kubernetes yet. Gaining experience with it is my next step.",
    "I have not used Kubernetes yet. I am keen to get hands-on experience with it.",
    "I deploy Docker Swarm where I have not used Kubernetes.",
  ])("%p passes", (sentence) => {
    expect(letterCodes(sentence)).not.toContain("LABEL_ONLY_CLAIM");
  });

  test.each([
    ["I have not used Kubernetes yet. I have production experience with it.", ["Kubernetes"]],
    ["I have not used Kubernetes in the cloud. I aim to keep running it on-prem as I do today.", ["Kubernetes"]],
    ["Your team gets Kubernetes skills on day one.", []],
    ["Your team would welcome a Kubernetes specialist.", []],
  ])("%p fails with LABEL_ONLY_CLAIM (honestGaps %p)", (sentence, honestGaps) => {
    expect(letterCodes(sentence, honestGaps)).toContain("LABEL_ONLY_CLAIM");
  });
});

describe("number scanner edges", () => {
  test.each([
    ["5G+", "over 5G", ["5"]],
    ["Q3.5", "in Q3.5a", ["3.5"]],
    ["Tier3, L1, P2 and B2C", "", []],
    ["12 3456", "", ["12", "3456"]],
    ["1 2345", "", ["1", "2345"]],
    ["123 456", "", ["123,456"]],
  ])("%p (evidence %p) tokenizes as %p", (text, evidence, expected) => {
    expect(numberTokens(text, evidence)).toEqual(expected);
  });
});

describe("ADJECTIVE_STACK edges", () => {
  test.each(["Shipped the Secure Scalable Reliable Platform tool.", "Built secure serverless executive dashboards."])("%p has no stack", (text) => {
    expect(findAdjectiveStacks(text)).toEqual([]);
  });
});

describe("critique loop edges", () => {
  const draft = validApplicationDraftV2() as ApplicationDraft;
  const review = reviewApplicationDraft(draft, brief);
  const answer = (score: number, version: unknown = 1): CritiqueResult => ({
    version: version as 1,
    // Joe, PR #19 follow-up: a critique now echoes the draft's digest.
    draftDigest: draftDigest(draft, brief),
    sections: CRITIQUE_SECTIONS.filter((section) => section !== "projects" || draft.cv.projects.length > 0).map((section) => ({
      section,
      scores: Object.fromEntries(criticCriteria(section).map((criterion) => [criterion.id, score])),
      failingPatterns: [],
      rewriteHint: "",
    })),
  });

  test("a score of exactly 3 fails its section and exactly 4 passes", () => {
    const three = answer(5);
    three.sections[0]!.scores[Object.keys(three.sections[0]!.scores)[0]!] = 3;
    expect(critiqueDraft(draft, brief, review, three, 0).critique.status).toBe("failed");
    expect(critiqueDraft(draft, brief, review, answer(4), 0).critique.status).toBe("passed");
  });

  test("rounds clamp to 0..2, and round 2 reports instead of regenerating", () => {
    expect(critiqueDraft(draft, brief, review, answer(2), 99).critique.round).toBe(2);
    expect(critiqueDraft(draft, brief, review, answer(2), -1).critique.round).toBe(0);
    expect(critiqueDraft(draft, brief, review, answer(2), 1).critique.next.action).toBe("regenerate");
    expect(critiqueDraft(draft, brief, review, answer(2), 2).critique.next.action).toBe("report");
  });

  test("fractional scores and another contract version are invalid", () => {
    const half = answer(5);
    half.sections[0]!.scores[Object.keys(half.sections[0]!.scores)[0]!] = 4.5;
    expect(critiqueDraft(draft, brief, review, half, 0).critique.status).toBe("invalid");
    expect(critiqueDraft(draft, brief, review, answer(5, 2), 0).critique.status).toBe("invalid");
  });

  test("the critic sees at most 6,000 characters of the posting", () => {
    const posting = `${applicationPosting} ${"Platform work. ".repeat(600)} TAILMARKER`;
    const local = buildApplicationBrief({ profile: applicationProfile, posting, company: "Acme", role: "Platform Engineer" });
    expect(critiqueDraft(draft, local, reviewApplicationDraft(draft, local), undefined, 0).critique.prompt).not.toContain("TAILMARKER");
  });
});
