import { describe, expect, test } from "bun:test";
import { BANNED_PHRASES, bannedPhrasePromptList, findBannedPhrases } from "../src/banned-phrases.js";
import { buildApplicationBrief, reviewApplicationDraft } from "../src/application-draft.js";
import { applicationProfile, validApplicationDraft, validApplicationDraftV2 } from "./fixtures/application.js";

const posting = "Platform Engineer at Acme. Requirements: Python, Terraform, AWS. Nice to have: Kubernetes.";
const brief = () => buildApplicationBrief({ profile: applicationProfile, posting, company: "Acme", role: "Platform Engineer" });
const codes = (draft: unknown) => reviewApplicationDraft(draft, brief()).findings;

describe("banned phrase list", () => {
  test("keeps the 10 original robotic phrases and adds the AUDIT.md §4.2 list", () => {
    const labels = BANNED_PHRASES.map((entry) => entry.phrase);
    for (const original of ["i am writing to apply", "i am writing to express my", "i believe my experience aligns", "intersection of what i do best", "proven track record", "measurable outcomes", "multiple production environments", "ready to deliver immediate impact", "your esteemed company", "cutting-edge"]) {
      expect(labels).toContain(original);
    }
    expect(BANNED_PHRASES.length).toBeGreaterThanOrEqual(45);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test.each([
    ["Results-driven engineer", "results-driven"],
    ["results driven engineer", "results-driven"],
    ["I am passionate about identity.", "passionate"],
    ["A dynamic professional.", "dynamic"],
    ["Highly motivated engineer.", "motivated"],
    ["Detail oriented reviewer.", "detail-oriented"],
    ["A team player.", "team player"],
    ["Self-starter.", "self-starter"],
    ["Hardworking and reliable.", "hard-working"],
    ["Strong background in security.", "strong background in"],
    ["Extensive experience with Azure.", "extensive experience"],
    ["A wide range of tools.", "wide range of"],
    ["Worked across various teams.", "various"],
    ["Cutting edge tooling.", "cutting-edge"],
    ["State-of-the-art detection.", "state-of-the-art"],
    ["Delivered innovative solutions.", "innovative solutions"],
    ["Built a robust pipeline.", "robust"],
    ["Seamlessly migrated mail.", "seamless"],
    ["World-class team.", "world-class"],
    ["Best in class tooling.", "best-in-class"],
    ["Created synergies.", "synergy"],
    ["Leveraged Graph to automate.", "leverage (verb)"],
    ["Spearheaded the rollout.", "spearheaded"],
    ["Utilized PowerShell.", "utilized"],
    ["Responsible for Intune.", "responsible for"],
    ["Helped to deploy Sentinel.", "helped"],
    ["Worked on identity.", "worked on"],
    ["Involved in audits.", "involved in"],
    ["Tasked with patching.", "tasked with"],
    ["Driving results for clients.", "drive results"],
    ["A value-add for the team.", "value-add"],
    ["Think outside the box.", "think outside the box"],
    ["Hit the ground running.", "hit the ground running"],
    ["Thrives in a fast-paced environment.", "fast-paced environment"],
    ["Delivered end-to-end solutions.", "end-to-end solutions"],
    ["Enhanced security posture.", "enhance security posture (no object)"],
    ["Improved the overall security posture.", "enhance security posture (no object)"],
    ["A proven track record.", "proven track record"],
  ])("flags %p", (text, phrase) => {
    expect(findBannedPhrases(text).map((hit) => hit.phrase)).toContain(phrase);
  });

  test.each([
    "Built Entra ID dynamic groups for every client tenant.",
    "Configured dynamic membership rules in Intune.",
    "The migration was motivated by audit findings.",
    "Modelled the leverage ratio in the finance dashboard.",
    "Ran the migration end to end for every client tenant.",
    "Rolled out end-to-end encryption for mail.",
    "Improved the security posture of the client tenants with Conditional Access.",
    "Hardened the network and reviewed the robots.txt file.",
    "Automated cloud environment delivery with Python and Terraform.",
    "Worked with the security team on access reviews.",
    // Word boundaries: a banned word inside a longer word is not a hit.
    "Ran dispassionate post-incident reviews.",
    "Dynamically scaled the AKS node pools.",
    "Reworked onboarding runbooks.",
    "Deleveraged the legacy scripts.",
    "Networked on-prem sites over IPsec.",
  ])("does not flag technical or concrete wording: %p", (text) => {
    expect(findBannedPhrases(text)).toEqual([]);
  });

  test("hits carry the matched text and a rewrite hint", () => {
    const [hit] = findBannedPhrases("Spearheaded the Intune rollout.");
    expect(hit).toMatchObject({ phrase: "spearheaded", match: "Spearheaded" });
    expect(hit.hint.length).toBeGreaterThan(0);
  });
});

describe("banned phrases block the deterministic review", () => {
  test("the clean fixture still passes", () => {
    expect(reviewApplicationDraft(validApplicationDraftV2(), brief()).pass).toBe(true);
  });

  test("a banned phrase in a CV bullet is an error with the field path, and the draft fails", () => {
    const draft = validApplicationDraft();
    draft.cv.experience[0].bullets[1].text = "Responsible for deployment tooling with the security team.";
    const review = reviewApplicationDraft(draft, brief());
    expect(review.pass).toBe(false);
    expect(review.findings).toContainEqual(expect.objectContaining({ severity: "error", code: "BANNED_PHRASE", path: "cv.experience.0.bullets.1" }));
  });

  test("a banned phrase in the summary, a skill or the cover letter fails too", () => {
    const summary = validApplicationDraft();
    summary.cv.summary.text = `Results-driven ${summary.cv.summary.text}`;
    expect(codes(summary)).toContainEqual(expect.objectContaining({ code: "BANNED_PHRASE", path: "cv.summary" }));

    const letter = validApplicationDraft();
    letter.coverLetter.paragraphs[0].text = `I am writing to apply. ${letter.coverLetter.paragraphs[0].text}`;
    const review = reviewApplicationDraft(letter, brief());
    expect(review.pass).toBe(false);
    expect(review.findings).toContainEqual(expect.objectContaining({ severity: "error", code: "BANNED_PHRASE", path: "coverLetter.paragraphs.0" }));
  });

  test("the old warning-only code is gone", () => {
    const draft = validApplicationDraft();
    draft.cv.summary.text = `${draft.cv.summary.text} Proven track record.`;
    const found = codes(draft).map((finding) => finding.code);
    expect(found).not.toContain("ROBOTIC_PHRASE");
    expect(found).toContain("BANNED_PHRASE");
  });

  test("the same lead verb on more than two bullets is a warning, not an error", () => {
    const draft = validApplicationDraft();
    draft.cv.experience[0].bullets = [
      { text: "Automated cloud environment delivery with Python.", evidenceIds: ["profile:experience:0:achievement:0"] },
      { text: "Automated Terraform delivery for the platform.", evidenceIds: ["profile:experience:0:achievement:0"] },
      { text: "Automated deployment tooling with the security team.", evidenceIds: ["profile:experience:0:responsibility:0"] },
    ];
    const review = reviewApplicationDraft(draft, brief());
    expect(review.findings).toContainEqual(expect.objectContaining({ severity: "warning", code: "REPEATED_LEAD_VERB" }));
    expect(review.findings.filter((finding) => finding.code === "REPEATED_LEAD_VERB").every((finding) => finding.severity === "warning")).toBe(true);
  });

  test("the writer prompt lists the banned phrases so the model avoids them", () => {
    const prompt = brief().prompt;
    expect(prompt).toContain("These banned phrases fail validation");
    expect(prompt).toContain(bannedPhrasePromptList());
    expect(bannedPhrasePromptList()).toContain("results-driven");
  });
});
