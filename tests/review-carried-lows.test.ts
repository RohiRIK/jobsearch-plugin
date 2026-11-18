/**
 * PR 4: LOWs carried from #18 (Sam §11-§12, Pat QA @ 442d7e1). The number
 * check stays fail closed; these cases tighten it where evidence was too
 * generous and loosen it only for named identifiers.
 */
import { describe, expect, test } from "bun:test";
import { buildApplicationBrief, numberTokens, reviewApplicationDraft } from "../src/application-draft.js";
import { applicationPosting, applicationProfile, validApplicationDraftV2 } from "./fixtures/application.js";

function bulletReview(evidenceTail: string, claimTail: string) {
  const profile = structuredClone(applicationProfile);
  profile.experience![0].achievements = [`Automated cloud environment delivery with Python and Terraform ${evidenceTail}.`];
  const brief = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
  const draft = validApplicationDraftV2();
  draft.cv.experience[0].bullets[0].text = `Automated cloud environment delivery with Python and Terraform ${claimTail}.`;
  return reviewApplicationDraft(draft, brief).findings.map((finding) => finding.code);
}

describe("number check: evidence no longer over-backs (QA, PR #18 @ 442d7e1)", () => {
  test.each([
    // Space-, no-break-space- and apostrophe-grouped thousands are one figure.
    ["for 1 200 000 users", "for 200 users", false],
    ["for 1 200 000 users", "for 1 users", false],
    ["for 1\u00A0200\u00A0000 users", "for 200 users", false],
    ["for 1'000 users", "for 1 users", false],
    ["for 1 200 000 users", "for 1 200 000 users", true],
    ["for 1 200 000 users", "for 1,200,000 users", true],
    ["for 1,200,000 users", "for 1 200 000 users", true],
    ["in 2023 100 users", "for 100 users", true],
    // Digit-led identifiers in evidence are names, not figures.
    ["with 2FA", "for 2 teams", false],
    ["with 3D models", "for 3 teams", false],
    ["over 5G", "for 5 sites", false],
    ["in 2024Q3", "for 3 teams", false],
    ["in 2024Q3", "in Q3", false],
    ["with 2FA", "with 2FA", true],
    ["over 5G", "over 5G", true],
    // A percentage does not back a count.
    ["for 90% of tenants", "for 90 teams", false],
    ["for 90% of tenants", "for 90% of tenants", true],
    ["for 90 % of tenants", "for 90% of tenants", true],
    ["for 90% of tenants", "for 90 % of tenants", true],
    ["for 100+ users", "for 100 users", true],
    // A sign on the claim needs a signed figure; a signed figure backs its value.
    ["cutting costs 40%", "at -40% cost", false],
    ["cutting costs 40%", "at \u221240% cost", false],
    ["at -40% cost", "at -40% cost", true],
    ["at \u221240% cost", "at -40% cost", true],
    ["at -40% cost", "cutting costs 40%", true],
    ["for COVID-19 sites", "for 19 sites", true],
    // x86/x64 may be a multiplier.
    ["", "and sped up builds x64", false],
    ["on x64 hosts", "on x64 hosts", true],
  ])("evidence %p, claim %p, supported=%p", (evidenceTail, claimTail, supported) => {
    const found = bulletReview(evidenceTail, claimTail);
    if (supported) expect(found).not.toContain("UNSUPPORTED_NUMBER");
    else expect(found).toContain("UNSUPPORTED_NUMBER");
  });

  test.each([
    ["1 200 000 users", "", ["1,200,000"]],
    ["90 % of tenants", "", ["90%"]],
    ["-40% and \u221240%", "", ["-40%", "-40%"]],
    ["COVID-19", "", ["19"]],
    ["2FA and 5G", "", ["2", "5"]],
    ["2FA and 5G", "with 2FA over 5G", []],
    ["2024Q3", "", ["2024", "3"]],
    ["10kg", "", ["10"]],
    ["10x", "", ["10x"]],
  ])("%p (evidence %p) tokenizes as %p", (text, evidence, expected) => {
    expect(numberTokens(text, evidence)).toEqual(expected);
  });

  // Base 442d7e1 on this shape: 6.7 s ('a1') and 2.3 s (Arabic-Indic); now about 20 ms and 110 ms.
  test.each([
    ["identifier lookup is one set per evidence line ('a1.' claims, 200 KB of 'a1')", "a1".repeat(100_000), "a1.".repeat(400)],
    ["non-ASCII evidence digits are normalised once per review", "\u0669".repeat(200_000), "Shipped the release 9 times."],
  ])("%s", (_name, evidenceLine, claim) => {
    const profile = structuredClone(applicationProfile);
    profile.experience![0].achievements = [evidenceLine];
    const brief = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets = Array.from({ length: 7 }, () => ({ text: claim, evidenceIds: ["profile:experience:0:achievement:0"] }));
    const started = performance.now();
    reviewApplicationDraft(draft, brief);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

// Sam (PR #18 @ 442d7e1) residual phrasing gaps: each of these passed on 442d7e1.
describe("cover letter: phrasing that claims a label-only skill", () => {
  const labelBrief = (() => {
    const profile = structuredClone(applicationProfile);
    profile.skills = [{ category: "Automation", skills: ["Python", "Terraform", "Kubernetes"] }];
    return buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
  })();
  const letterCodes = (sentence: string, honestGaps: string[] = ["Kubernetes"]) => {
    const draft = validApplicationDraftV2();
    draft.coverLetter.paragraphs[1].text += ` ${sentence}`;
    draft.strategy.honestGaps = honestGaps;
    return reviewApplicationDraft(draft, labelBrief).findings.filter((finding) => finding.severity === "error").map((finding) => finding.code);
  };

  test.each([
    ["Your team gets a Kubernetes expert.", []],
    ["Your team gains a Kubernetes specialist from day one.", []],
    ["Your platform team adds a Kubernetes operator.", []],
    ["I have not used Helm with the Kubernetes clusters I run in production.", ["Kubernetes"]],
    ["I have not used Helm on the Kubernetes platform that I also manage.", ["Kubernetes"]],
    ["I have not used Kubernetes. I have years of experience with it.", ["Kubernetes"]],
    ["I have not used Kubernetes. I am proficient in it.", ["Kubernetes"]],
    ["I have not used Kubernetes. It is on my list. I run it daily.", ["Kubernetes"]],
    ["I have not used Kubernetes. It is on my list. They say I am an expert with it.", ["Kubernetes"]],
  ])("%p fails with LABEL_ONLY_CLAIM (honestGaps %p)", (sentence, honestGaps) => {
    expect(letterCodes(sentence, honestGaps)).toContain("LABEL_ONLY_CLAIM");
  });

  test.each([
    "Your team uses Kubernetes.",
    "Your platform runs on Kubernetes at scale.",
    "I have not used Kubernetes yet; I am keen to gain experience with it.",
    "I have not used Kubernetes. I would like experience with it.",
    "I have not used Kubernetes. I run Docker Swarm daily. I run it for every client.",
    "I have not used Kubernetes. It is on my list.",
    "I have not run Kubernetes in production yet, but I run Docker Swarm.",
  ])("%p still passes", (sentence) => {
    expect(letterCodes(sentence)).not.toContain("LABEL_ONLY_CLAIM");
  });
});

// QA (PR #19 @ caa4ff6): each of these let a declared-gap claim or a copied duty through on caa4ff6.
describe("QA @ caa4ff6: residual claim phrasing, copied duties and en-dash signs", () => {
  const labelBrief = (() => {
    const profile = structuredClone(applicationProfile);
    profile.skills = [{ category: "Automation", skills: ["Python", "Terraform", "Kubernetes"] }];
    return buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
  })();
  const letterCodes = (sentence: string) => {
    const draft = validApplicationDraftV2();
    draft.coverLetter.paragraphs[1].text += ` ${sentence}`;
    draft.strategy.honestGaps = ["Kubernetes"];
    return reviewApplicationDraft(draft, labelBrief).findings.filter((finding) => finding.severity === "error").map((finding) => finding.code);
  };

  test.each([
    // LATER_HANDS_ON: contractions, "we", "been" and adverbs.
    "I have not used Helm with the Kubernetes clusters I've run in production.",
    "I have not used Helm with the Kubernetes clusters I\u2019ve run in production.",
    "I have not used Helm with the Kubernetes clusters I'm running in production.",
    "I have not used Helm with the Kubernetes clusters I personally run in production.",
    "I have not used Helm with the Kubernetes clusters we run in production.",
    "I have not used Helm with the Kubernetes clusters I have been running.",
    // An aspiration word does not cancel a claim word the writer already holds.
    "I have not used Kubernetes in the cloud. I am eager to apply my years of experience with it.",
    "I have not used Kubernetes in the cloud. I want you to know I have years of experience with it.",
    "I have not used Kubernetes in the cloud. I hope my expertise in it shows.",
    // Having learned is a claim; wanting to learn is not.
    "I have not used Kubernetes in the cloud. I learned to run it in production in 2019.",
    // Demonstratives and a "That ..." link in the chain.
    "I have not used Kubernetes. I run that daily.",
    "I have not used Kubernetes. I run this platform daily.",
    "I have not used Kubernetes. That is on my list. I run it daily.",
  ])("%p fails with LABEL_ONLY_CLAIM", (sentence) => {
    expect(letterCodes(sentence)).toContain("LABEL_ONLY_CLAIM");
  });

  test.each([
    "I have not used Kubernetes yet. I am keen to gain experience with it.",
    "I have not used Kubernetes yet. I would like to learn it.",
    "I have not used Kubernetes yet. I am learning to run it on a lab cluster.",
    "I have not used Kubernetes yet. I hope to gain expertise in it.",
    "I have not used Kubernetes. This role is why I want to.",
    "I have not used Kubernetes. I use that approach with Docker Swarm.",
  ])("%p still passes", (sentence) => {
    expect(letterCodes(sentence)).not.toContain("LABEL_ONLY_CLAIM");
  });

  test.each([
    ["profile:experience:0:achievement:0"],
    ["profile:experience:0"],
    ["profile:project:delivery-pipeline"],
  ])("a bullet that copies a responsibility line fails RAW_PARAPHRASE even when it cites %p", (cite) => {
    const brief = buildApplicationBrief({ profile: applicationProfile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[1] = { text: "Maintained deployment tooling with the security team.", evidenceIds: [cite] };
    expect(reviewApplicationDraft(draft, brief).findings).toContainEqual(expect.objectContaining({ code: "RAW_PARAPHRASE", path: "cv.experience.0.bullets.1" }));
  });

  test("restating a cited achievement as written is still allowed", () => {
    const brief = buildApplicationBrief({ profile: applicationProfile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
    expect(reviewApplicationDraft(validApplicationDraftV2(), brief).findings.map((finding) => finding.code)).not.toContain("RAW_PARAPHRASE");
  });

  test.each([
    ["-40% and \u201340%", "", ["-40%", "-40%"]],
    ["40\u201350%", "", ["40", "50%"]],
  ])("en dash: %p (evidence %p) tokenizes as %p", (text, evidence, expected) => {
    expect(numberTokens(text, evidence)).toEqual(expected);
  });
});
