import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ApplicationDraft, buildApplicationBrief, numberTokens, reviewApplicationDraft } from "../src/application-draft.js";
import { renderCvTypst } from "../src/application-renderers.js";
import { NO_INVENTED_METRICS, SECTION_RUBRICS, findPlaceholderMetrics, rubricPromptBlock } from "../src/section-rubrics.js";
import { applicationPosting, applicationProfile, validApplicationDraft, validApplicationDraftV2 } from "./fixtures/application.js";

const brief = buildApplicationBrief({ profile: applicationProfile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
const codes = (draft: unknown) => reviewApplicationDraft(draft, brief).findings.map((finding) => finding.code);
const errors = (draft: unknown) => reviewApplicationDraft(draft, brief).findings.filter((finding) => finding.severity === "error").map((finding) => finding.code);

describe("section rubrics and writer prompt v2", () => {
  test("the prompt carries the rubrics, the no-invented-metrics rule, the matrix and contract v2", () => {
    expect(brief.prompt).toContain("<section_rubrics>");
    expect(brief.prompt).toContain(rubricPromptBlock());
    expect(brief.prompt).toContain(NO_INVENTED_METRICS);
    expect(brief.prompt).toContain('"version": 2');
    expect(brief.prompt).toContain('"group": "capability area');
    expect(brief.prompt).toContain("evidence matrix");
    expect(brief.prompt).not.toContain("result or responsibility");
  });

  test("every CV section has a rubric with purpose, must-contain and fails", () => {
    expect(SECTION_RUBRICS.map((rubric) => rubric.section)).toEqual(["headline", "summary", "skills", "experience", "projects"]);
    for (const rubric of SECTION_RUBRICS) {
      expect(rubric.purpose.length).toBeGreaterThan(10);
      expect(rubric.mustContain.length).toBeGreaterThan(0);
      expect(rubric.fails.length).toBeGreaterThan(0);
    }
    expect(SECTION_RUBRICS.find((rubric) => rubric.section === "summary")!.purpose).toMatch(/value proposition/);
    expect(SECTION_RUBRICS.find((rubric) => rubric.section === "experience")!.mustContain.join(" ")).toMatch(/problem or context, then the action .* result or the scope/);
  });

  test("SectionRubrics.md stays in step with src/section-rubrics.ts", () => {
    const doc = readFileSync(join(import.meta.dir, "../job-search/skills/cv/SectionRubrics.md"), "utf-8").toLowerCase();
    for (const rubric of SECTION_RUBRICS) {
      expect(doc).toContain(`## ${rubric.section}`);
      for (const line of [rubric.purpose, rubric.length, ...rubric.mustContain, ...rubric.fails]) expect(doc).toContain(line.toLowerCase());
    }
  });

  test("the legacy guide no longer asks for X% metrics or contradictory summary lengths", () => {
    const legacy = readFileSync(join(import.meta.dir, "../job-search/skills/cv/05-cv-templates.md"), "utf-8");
    expect(findPlaceholderMetrics(legacy)).toEqual([]);
    expect(legacy).not.toMatch(/5-7 lines|1-3 sentences|5-7 key competencies/);
    expect(legacy).toContain("SectionRubrics.md");
  });
});

describe("placeholder metrics", () => {
  test.each([
    "Reduced processing time by X%",
    "Cut onboarding to N days for new hires.",
    "Grew adoption by XX% across teams.",
    "Saved $X per year in licences.",
    "Improved sign-in success [metric] after the rollout.",
    "Migrated {number} devices to Intune.",
    "Reduced tickets by X.",
    "Onboarded X+ users.",
    "Result: TBD",
    "Cut tickets by ??%.",
    // QA (PR #18) S4: lowercase, fold, TBC and symbol slots.
    "Reduced processing time by x%.",
    "Grew adoption by xx percent.",
    "Delivered an X-fold increase in throughput.",
    "Delivered an x fold increase in throughput.",
    "Savings: TBC",
    "Cut incident volume by #%.",
    "Cut incident volume by __%.",
  ])("flags %p", (text) => {
    expect(findPlaceholderMetrics(text).length).toBeGreaterThan(0);
  });

  test.each([
    "Automated posting to X (Twitter) with the official API.",
    "Rolled out Defender XDR and EDR to every client tenant.",
    "Issued X.509 certificates for device authentication.",
    "Managed Windows Server and Microsoft 365 tenants.",
    "Built an N-tier web app on Next.js.",
    "Replaced manual GPO review with a scripted mapping.",
    "Ported the agent from x86 to arm64 builds.",
    "Cut build time 10x with a remote cache.",
    "Ranked #1 in the internal security CTF.",
    "Wrote C# services and x64 installers.",
    "Raised cache hits to 99% on x86 runners.",
  ])("does not flag %p", (text) => {
    expect(findPlaceholderMetrics(text)).toEqual([]);
  });
});

describe("review: never invent metrics (AUDIT.md §4 hard rule)", () => {
  test("a grounded v2 draft passes with no errors", () => {
    const review = reviewApplicationDraft(validApplicationDraftV2(), brief);
    expect(review.findings.filter((finding) => finding.severity === "error")).toEqual([]);
    expect(review.pass).toBe(true);
  });

  test("a placeholder metric fails review", () => {
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[0].text = "Automated cloud environment delivery with Python and Terraform, cutting lead time by X%.";
    expect(errors(draft)).toContain("PLACEHOLDER_METRIC");
    expect(reviewApplicationDraft(draft, brief).pass).toBe(false);
  });

  test("a placeholder in the cover letter fails too", () => {
    const draft = validApplicationDraftV2();
    draft.coverLetter.paragraphs[0].text += " That work cut release time by [metric].";
    expect(errors(draft)).toContain("PLACEHOLDER_METRIC");
  });

  test("an invented number fails review", () => {
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[0].text = "Automated cloud environment delivery with Python and Terraform, cutting lead time by 40%.";
    expect(errors(draft)).toContain("UNSUPPORTED_NUMBER");
  });

  test("a number is supported only as a whole number, not as part of a longer one", () => {
    const profile = structuredClone(applicationProfile);
    profile.experience![0].achievements = ["Automated cloud environment delivery with Python and Terraform for 140 teams."];
    const local = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[0].text = "Automated cloud environment delivery with Python and Terraform for 40 teams.";
    expect(reviewApplicationDraft(draft, local).findings.map((finding) => finding.code)).toContain("UNSUPPORTED_NUMBER");
    draft.cv.experience[0].bullets[0].text = "Automated cloud environment delivery with Python and Terraform for 140 teams.";
    expect(reviewApplicationDraft(draft, local).findings.map((finding) => finding.code)).not.toContain("UNSUPPORTED_NUMBER");
  });

  // QA (PR #18): kill surviving mutations of evidenceHasNumber's lookarounds.
  test.each([
    ["Automated cloud environment delivery with Python and Terraform for 400 teams.", "400"],
    ["Automated cloud environment delivery with Python and Terraform for 40.5 teams.", "40.5"],
    ["Automated cloud environment delivery with Python and Terraform for 40,000 teams.", "40,000"],
    ["Automated cloud environment delivery with Python and Terraform for 3.40 teams.", "3.40"],
    ["Automated cloud environment delivery with Python and Terraform for 3,40 teams.", "3,40"],
  ])("evidence %p does not support a bare 40", (evidenceText) => {
    const profile = structuredClone(applicationProfile);
    profile.experience![0].achievements = [evidenceText];
    const local = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[0].text = "Automated cloud environment delivery with Python and Terraform for 40 teams.";
    expect(reviewApplicationDraft(draft, local).findings.map((finding) => finding.code)).toContain("UNSUPPORTED_NUMBER");
  });

  // QA (PR #18): the whole-number check split grouped numbers and ignored magnitude.
  test.each([
    ["for 1,200,000 users", "for 1,200,000 users", true],
    ["saving $2.5M", "saving $2.5M", true],
    ["for 10k endpoints", "for 10K endpoints", true],
    ["for 10k endpoints", "for 10M endpoints", false],
    ["for 1,200,000 users", "for 1,500,000 users", false],
    ["for 2 teams", "for 2,000 teams", false],
  ])("evidence %p, claim %p, supported=%p", (evidenceTail, claimTail, supported) => {
    const profile = structuredClone(applicationProfile);
    profile.experience![0].achievements = [`Automated cloud environment delivery with Python and Terraform ${evidenceTail}.`];
    const local = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[0].text = `Automated cloud environment delivery with Python and Terraform ${claimTail}.`;
    const found = reviewApplicationDraft(draft, local).findings.map((finding) => finding.code);
    if (supported) expect(found).not.toContain("UNSUPPORTED_NUMBER");
    else expect(found).toContain("UNSUPPORTED_NUMBER");
  });

  // QA (PR #18) S3: a CV claim's number must come from the candidate's profile.
  test("a CV bullet cannot borrow a number from the posting by citing job:posting", () => {
    const posting = `${applicationPosting} Join 400 engineers on the platform team.`;
    const local = buildApplicationBrief({ profile: applicationProfile, posting, company: "Acme", role: "Platform Engineer" });
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[0] = {
      text: "Automated cloud environment delivery with Python and Terraform for 400 engineers.",
      evidenceIds: ["profile:experience:0:achievement:0", "job:posting"],
    };
    const review = reviewApplicationDraft(draft, local);
    expect(review.findings.find((finding) => finding.code === "UNSUPPORTED_NUMBER")?.path).toBe("cv.experience.0.bullets.0");
    expect(review.pass).toBe(false);
    // The cover letter may still quote the employer's own figure.
    const letter = validApplicationDraftV2();
    letter.coverLetter.paragraphs[0].text = letter.coverLetter.paragraphs[0].text.replace("Acme needs", "Acme's 400 engineers need");
    expect(reviewApplicationDraft(letter, local).findings.map((finding) => finding.code)).not.toContain("UNSUPPORTED_NUMBER");
  });

  test.each([
    ["for 10k endpoints", "for 10 endpoints", false],
    ["with 10ms p99 latency", "with 10ms p99 latency", true],
    ["on 5GB nodes", "on 5GB nodes", true],
    ["to ISO27001 and release v2.3.1", "to ISO27001 and release v2.3.1", true],
    // QA (PR #18 @ ad3fefb): magnitude is case-sensitive except k/K.
    ["cutting builds to 10m", "for 10M users", false],
    ["for 10M users", "cutting builds to 10m", false],
    ["cutting builds to 10m", "cutting builds to 10m", true],
    ["on a 3b-parameter model", "saving $3B", false],
    ["for 10K endpoints", "for 10k endpoints", true],
    ["for 10kg loads", "for 10k loads", false],
    ["for 5 teams", "with 5x faster releases", false],
    ["with 5x faster releases", "for 5 teams", false],
    ["with 5x faster releases", "with 5x faster releases", true],
    // Sam (PR #18 @ ad3fefb): a number right after bare punctuation is still checked.
    ["for 5 teams", "at.5x the cost", false],
    ["for 5 teams", "cutting spend by.75%", false],
    ["for 5 teams", "and Python,90% coverage", false],
    ["and Python,90% coverage", "and Python,90% coverage", true],
    // Sam (PR #18 @ abe3d4e) MED: a figure glued after an identifier is still checked.
    ["for 5 teams", "in Q3,90% of releases", false],
    ["for 5 teams", "in FY24,40% of releases", false],
    ["for 5 teams", "to ISO27001,90% of controls", false],
    ["for 5 teams", "on v2.3.1,90% of releases", false],
    ["for 5 teams", "in Q3.90% of releases", false],
    ["in Q3, 90% of releases", "in Q3,90% of releases", true],
    // Evidence is read with the same scanner, so glued evidence backs a glued claim.
    ["in Q3,90% of releases", "in Q3,90% of releases", true],
    // Fail closed: an unlisted identifier is a figure unless the evidence names it.
    ["for 5 teams", "on the ABC123 platform", false],
    ["on the ABC123 platform", "on the ABC123 platform", true],
    ["for 5x faster releases", "at .5x the cost", false],
    ["at 0.5x the cost", "at .5x the cost", true],
    // Sam (PR #18 @ abe3d4e) LOW: X is a multiplier like x, and the two fold.
    ["over 3.5 years", "with 3.5X faster releases", false],
    ["for 10 teams", "with 10X faster releases", false],
    ["with 3.5x faster releases", "with 3.5X faster releases", true],
    ["with 10X faster releases", "with 10x faster releases", true],
    // QA (PR #18 @ 31e1b4a): X is a magnitude in evidence too, and a suffixed X token ends there.
    ["with 5X faster releases", "for 5 teams", false],
    ["for 10XL shirts", "with 10X faster releases", false],
    // QA (PR #18 @ 31e1b4a): digits inside an identifier in evidence do not back a figure.
    ["in Q3", "for 3 teams", false],
    ["on K8s", "for 8 clusters", false],
    ["for M365 tenants", "for 365 tenants", false],
    ["to ISO27001", "for 27001 users", false],
    ["in Q3,90% of releases", "for 3,90% of releases", false],
    ["in FY24", "for 24 teams", false],
    ["over IPv6", "for 6 sites", false],
    ["on x86", "for 86 hosts", false],
    ["with SHA256", "for 256 repos", false],
    ["with Python3", "for 3 teams", false],
    ["cut lead time by90%", "cut lead time by90%", true],
    // QA (PR #18 @ 442d7e1): pin run-level backing, +/% stripping and evidence normalisation (SC29, SC32, SC56 survived).
    ["for 1,2345 rows", "for 1,2345 rows", true],
    ["for 100+ users", "for 100 users", true],
    ["with 90%+ coverage", "with 90% coverage", true],
    ["on the ABC١٢٣ platform", "on the ABC123 platform", true],
    ["on Windows 11", "on Windows 11", true],
    // QA (PR #18 @ 82438a7): every digit form is checked, and a decimal comma is not two figures.
    ["for 5 teams", "for ٩٠% of releases", false],
    ["for 5 teams", "for ９０% of releases", false],
    ["for 5 teams", "for ½ the cost", false],
    ["for ٩٠% of releases", "for ٩٠% of releases", true],
    ["for 90% of releases", "for ٩٠% of releases", true],
    ["for 5 teams", "for 5,5 teams", false],
    ["for 3 teams and 5 sites", "in 3,5 days", false],
    ["in 3,5 days", "in 3,5 days", true],
    ["on Windows 11, 40% faster", "on Windows 11, 40% faster", true],
    // QA (PR #18 @ 82438a7): a glued identifier is named exactly, magnitude and %.
    ["cut builds by2m", "grew users by2M", false],
    ["cut costs up40", "cut costs up40%", false],
    ["on the ABC123 platform", "on the abc123 platform", true],
    // QA (PR #18 @ 82438a7) SC8/SC9/SC10/SC13: an identifier is named only as a
    // whole word, and never from inside a longer identifier or a digit run.
    ["in Q3", "in Q3", true],
    ["on the xQ3 board", "in Q3", false],
    ["on Q3x runners", "in Q3", false],
    ["in Q3.5 builds", "in Q3", false],
    ["in Q3 2024", "in 2024Q3", false],
    // Sam (PR #18 @ 82438a7) and QA C1 together: a glued % or + needs the same suffix in evidence.
    ["across M365 tenants", "across M365% of tenants", false],
    ["across M365% of tenants", "across M365% of tenants", true],
  ])("units and identifiers: evidence %p, claim %p, supported=%p", (evidenceTail, claimTail, supported) => {
    const profile = structuredClone(applicationProfile);
    profile.experience![0].achievements = [`Automated cloud environment delivery with Python and Terraform ${evidenceTail}.`];
    const local = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[0].text = `Automated cloud environment delivery with Python and Terraform ${claimTail}.`;
    const found = reviewApplicationDraft(draft, local).findings.map((finding) => finding.code);
    if (supported) expect(found).not.toContain("UNSUPPORTED_NUMBER");
    else expect(found).toContain("UNSUPPORTED_NUMBER");
  });

  // Sam (PR #18 @ ad3fefb) MED: the lookbehind excluded '.' and ',', so a
  // number right after bare punctuation was never checked.
  // Fail closed (Sam, PR #18 @ 31e1b4a): every digit run is a figure unless it
  // sits in an allowlisted identifier, a version string, or an identifier the
  // cited evidence names verbatim.
  describe("numberTokens", () => {
    test.each([
      [",90%", "", ["90%"]],
      [".5x", "", [".5x"]],
      ["cut costs by.75%", "", [".75%"]],
      ["Python,90%", "", ["90%"]],
      ["1,200,000 users", "", ["1,200,000"]],
      ["ISO27001 and v2.3.1", "", []],
      ["K8s and k8s", "", []],
      ["M365, Win10, ISO27001, v2.3.1 and K8s", "", []],
      // QA (PR #18 @ 442d7e1): x86/x64 can be a multiplier, so they need evidence naming them.
      ["x86 and x64", "", ["86", "64"]],
      ["x86 and x64", "on x86 and x64 hosts", []],
      ["E2E, O365, B2B, AES256, K3s, P1, L3 and Tier2", "", []],
      ["Q3,90%", "", ["3", "90%"]],
      ["Q3,90%", "in Q3", ["90%"]],
      ["FY24,40%", "", ["24", "40%"]],
      ["FY24,40%", "for FY24", ["40%"]],
      ["ISO27001,90%", "", ["90%"]],
      ["v2.3.1,90%", "", ["90%"]],
      ["Q3.90%", "", ["3", "90%"]],
      ["Q3.90%", "in Q3", ["90%"]],
      ["3.5X and 10X", "", ["3.5X", "10X"]],
      ["cut lead time by90%", "", ["90%"]],
      ["up40%", "", ["40%"]],
      ["Q3e90%", "", ["3", "90%"]],
      ["by2M", "", ["2M"]],
      ["up3x", "", ["3x"]],
      ["ABC123", "", ["123"]],
      ["ABC123", "the abc123 service", []],
      // QA (PR #18 @ 82438a7): a 1-2 digit comma group may be a decimal comma, so it stays whole.
      ["Windows 11,40%", "", ["11,40%"]],
      ["in 3,5 days", "", ["3,5"]],
      ["1,2345", "", ["1", "2345"]],
      // QA (PR #18 @ 82438a7): non-ASCII digits are read, not skipped.
      ["٩٠% and ۹۰% and ９０% and 𝟗𝟎%", "", ["90%", "90%", "90%", "90%"]],
      ["5½ teams", "", ["51", "2"]],
      // QA (PR #18 @ 31e1b4a) I6: an identifier never swallows a comma group.
      ["Q3,90 users", "in Q3", ["90"]],
    ])("%p (evidence %p) tokenizes as %p", (text, evidence, expected) => {
      expect(numberTokens(text, evidence)).toEqual(expected);
    });

    test.each([
      ["letters", "a".repeat(200_000)],
      ["digits", "1".repeat(200_000)],
      ["'1,'", "1,".repeat(100_000)],
      ["'a1'", "a1".repeat(100_000)],
      ["'a1.'", "a1.".repeat(66_000)],
      ["'Q3,'", "Q3,".repeat(66_000)],
    ])("200 KB of %p tokenizes in linear time", (_shape, text) => {
      const started = performance.now();
      numberTokens(text);
      // 250 ms, not 100: the worst shape hit 73 ms on a loaded runner (QA, PR #18 @ 442d7e1).
      // Quadratic behaviour at 200 KB is seconds, so the bound still catches it.
      expect(performance.now() - started).toBeLessThan(250);
    });
  });

  test.each([
    ["cut lead time by90%"], ["grew usage up40%"], ["shipped Q3e90% of releases"], ["onboarded by2M users"], ["sped up builds up3x"],
    [",90% of releases"], ["at.5x the cost"], ["cut spend by.75%"], ["Python,90% coverage"], ["in Q3,90% of releases"],
    ["in FY24,40% of releases"], ["to ISO27001,90% of controls"], ["on v2.3.1,90% of releases"], ["in Q3.90% of releases"],
  ])("unbacked glued figure %p fails with UNSUPPORTED_NUMBER", (claimTail) => {
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[0].text = `Automated cloud environment delivery with Python and Terraform ${claimTail}.`;
    expect(errors(draft)).toContain("UNSUPPORTED_NUMBER");
  });

  // Sam (PR #18 @ 82438a7) MED: a % or + glued on an allowlisted or version
  // identifier makes it a figure again.
  test.each([["grew v90% of releases"], ["grew V90% of releases"], ["grew v90 % of releases"], ["on win10% of laptops"], ["on x64% of hosts"], ["in s3% of buckets"], ["across M365% of tenants"]])(
    "allowlisted or version identifier with a glued %% %p fails with UNSUPPORTED_NUMBER",
    (claimTail) => {
      const draft = validApplicationDraftV2();
      draft.cv.experience[0].bullets[0].text = `Automated cloud environment delivery with Python and Terraform ${claimTail}.`;
      expect(errors(draft)).toContain("UNSUPPORTED_NUMBER");
    },
  );

  test.each([["by90", "by90%"], ["Q3e90", "Q3e90%"]])("a posting naming %p does not back a cover-letter %p", (postingWord, claimWord) => {
    const local = buildApplicationBrief({ profile: applicationProfile, posting: `${applicationPosting} Delivery improved ${postingWord} last year.`, company: "Acme", role: "Platform Engineer" });
    const draft = validApplicationDraftV2();
    const paragraph = draft.coverLetter.paragraphs[1];
    paragraph.text += ` Delivery improved ${claimWord} under my lead.`;
    if (!paragraph.evidenceIds.includes("job:posting")) paragraph.evidenceIds.push("job:posting");
    expect(reviewApplicationDraft(draft, local).findings).toContainEqual(expect.objectContaining({ code: "UNSUPPORTED_NUMBER", path: "coverLetter.paragraphs.1" }));
  });

  test.each([["on M365 tenants"], ["on O365 tenants"], ["for E2E tests"], ["with AES256"], ["on Win10 laptops"], ["to ISO27001"], ["on release v2.3.1"], ["on K8s"]])(
    "known identifier %p is not a figure",
    (claimTail) => {
      const draft = validApplicationDraftV2();
      draft.cv.experience[0].bullets[0].text = `Automated cloud environment delivery with Python and Terraform ${claimTail}.`;
      expect(errors(draft)).not.toContain("UNSUPPORTED_NUMBER");
    },
  );

  test("scope instead of a number passes", () => {
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[0].text = "Automated cloud environment delivery end to end with Python and Terraform.";
    expect(errors(draft)).toEqual([]);
  });

  test("missing evidence yields a gap, and claiming the gap fails", () => {
    expect(brief.evidenceMatrix.gaps).toContain("kubernetes");
    expect(brief.plan.openGaps).toContain("Kubernetes");
    const draft = validApplicationDraftV2();
    draft.cv.skills[0].items.push({ text: "Kubernetes", evidenceIds: ["profile:experience:0:achievement:0"] });
    expect(errors(draft)).toContain("GAP_AS_CLAIM");
  });

  // QA (PR #18) S5: a requirement backed only by a skill label is not proven.
  describe("label-only requirements", () => {
    const profile = structuredClone(applicationProfile);
    profile.skills![0].skills.push("Kubernetes");
    const local = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
    const localErrors = (draft: unknown) => reviewApplicationDraft(draft, local).findings.filter((finding) => finding.severity === "error");

    test("stay out of mustProve and are not gaps", () => {
      expect(local.evidenceMatrix.labelOnly).toContain("kubernetes");
      expect(local.plan.mustProve.map((term) => term.toLowerCase())).not.toContain("kubernetes");
      expect(local.plan.mustProve).toEqual(expect.arrayContaining(["Python", "Terraform"]));
      expect(localErrors(validApplicationDraftV2())).toEqual([]);
    });

    test.each([
      ["a v2 skill citing unrelated work", (draft: ReturnType<typeof validApplicationDraftV2>) => draft.cv.skills[0].items.push({ text: "Kubernetes", evidenceIds: ["profile:experience:0:achievement:0", "profile:skill:0:2"] }), "cv.skills.0.items.2"],
      ["the summary", (draft: ReturnType<typeof validApplicationDraftV2>) => { draft.cv.summary.text += " Runs Kubernetes clusters."; }, "cv.summary"],
      ["a bullet", (draft: ReturnType<typeof validApplicationDraftV2>) => { draft.cv.experience[0].bullets[1].text = "Maintained Kubernetes deployment tooling with the security team."; }, "cv.experience.0.bullets.1"],
    ])("claiming one in %p fails v2 review with LABEL_ONLY_CLAIM", (_where, mutate, path) => {
      const draft = validApplicationDraftV2();
      mutate(draft);
      const found = localErrors(draft);
      expect(found).toContainEqual(expect.objectContaining({ code: "LABEL_ONLY_CLAIM", path }));
      expect(found.map((finding) => finding.code)).not.toContain("GAP_AS_CLAIM");
      expect(reviewApplicationDraft(draft, local).pass).toBe(false);
    });

    // QA (PR #18 @ ad3fefb) B1: the cover letter is scanned with GAP_AS_CLAIM's sentence filter.
    test("a first-person claim in the cover letter fails", () => {
      const draft = validApplicationDraftV2();
      draft.coverLetter.paragraphs[1].text += " I run Kubernetes in production.";
      const found = localErrors(draft);
      expect(found).toContainEqual(expect.objectContaining({ code: "LABEL_ONLY_CLAIM", path: "coverLetter.paragraphs.1" }));
      expect(reviewApplicationDraft(draft, local).pass).toBe(false);
    });

    test.each([
      ["an employer-only sentence", "Your posting asks for Kubernetes."],
      ["a disclosure of a declared gap", "I have not run Kubernetes in production yet."],
    ])("%p in the cover letter passes", (_kind, sentence) => {
      const draft = validApplicationDraftV2();
      draft.strategy.honestGaps = ["Kubernetes"];
      draft.coverLetter.paragraphs[1].text += ` ${sentence}`;
      expect(localErrors(draft)).toEqual([]);
    });

    // Sam (PR #18 @ abe3d4e) LOW: as for GAP_AS_CLAIM, a disclosure phrase
    // exempts a sentence only when the term is declared in honestGaps.
    test.each([
      ["a disclosure of an undeclared gap", "I have not run Kubernetes in production yet."],
      ["'rather than'", "I ran Kubernetes in production for five years rather than just reading about it."],
      ["'instead of Docker Swarm'", "I ran Kubernetes at scale instead of Docker Swarm."],
      ["'I have not used Helm'", "I led Kubernetes migrations; I have not used Helm."],
    ])("%p in the cover letter fails when Kubernetes is not in honestGaps", (_kind, sentence) => {
      const draft = validApplicationDraftV2();
      draft.strategy.honestGaps = [];
      draft.coverLetter.paragraphs[1].text += ` ${sentence}`;
      expect(localErrors(draft)).toContainEqual(expect.objectContaining({ code: "LABEL_ONLY_CLAIM", path: "coverLetter.paragraphs.1" }));
    });

    // QA (PR #18 @ ad3fefb) B2: the requirement's alias group is matched, not only the exact term.
    test.each([
      ["a bullet", (draft: ReturnType<typeof validApplicationDraftV2>) => { draft.cv.experience[0].bullets[1].text = "Maintained K8s deployment tooling with the security team."; }, "cv.experience.0.bullets.1"],
      ["the cover letter", (draft: ReturnType<typeof validApplicationDraftV2>) => { draft.coverLetter.paragraphs[1].text += " I run K8s clusters in production."; }, "coverLetter.paragraphs.1"],
    ])("an alias (K8s) in %p fails with LABEL_ONLY_CLAIM", (_where, mutate, path) => {
      const draft = validApplicationDraftV2();
      mutate(draft);
      expect(localErrors(draft)).toContainEqual(expect.objectContaining({ code: "LABEL_ONLY_CLAIM", path }));
    });

    // QA (PR #18 @ ad3fefb) B3: scrum, agile and AI are checkable claims, not exempt broad words.
    describe("scrum, agile and AI are not exempt", () => {
      const broad = structuredClone(applicationProfile);
      broad.skills![0].skills.push("Scrum", "Agile", "AI");
      const broadBrief = buildApplicationBrief({ profile: broad, posting: `${applicationPosting} Nice to have: Scrum, Agile, AI.`, company: "Acme", role: "Platform Engineer" });
      const broadErrors = (draft: unknown) => reviewApplicationDraft(draft, broadBrief).findings.filter((finding) => finding.severity === "error");

      test("they are label-only and the valid draft still has no errors", () => {
        expect(broadBrief.evidenceMatrix.labelOnly).toEqual(expect.arrayContaining(["scrum", "agile", "ai"]));
        expect(broadErrors(validApplicationDraftV2())).toEqual([]);
      });

      test.each([
        ["scrum", "Ran Scrum ceremonies for the platform team."],
        ["agile", "Led Agile delivery for the platform team."],
        ["ai", "Built AI agents for the platform team."],
      ])("claiming %p fails", (term, text) => {
        const draft = validApplicationDraftV2();
        draft.cv.experience[0].bullets[1].text = text;
        expect(broadErrors(draft)).toContainEqual(expect.objectContaining({ code: "LABEL_ONLY_CLAIM", path: "cv.experience.0.bullets.1", message: expect.stringContaining(`'${term}'`) }));
      });
    });

    test("v1 drafts and briefs without a matrix are not affected", () => {
      const v1 = validApplicationDraft();
      v1.cv.summary.text += " Runs Kubernetes clusters.";
      expect(reviewApplicationDraft(v1, local).findings.map((finding) => finding.code)).not.toContain("LABEL_ONLY_CLAIM");
      const draft = validApplicationDraftV2();
      draft.cv.summary.text += " Runs Kubernetes clusters.";
      const legacy = { ...local, evidenceMatrix: undefined } as unknown as typeof local;
      expect(reviewApplicationDraft(draft, legacy).findings.map((finding) => finding.code)).not.toContain("LABEL_ONLY_CLAIM");
    });
  });
});

describe("review: section rubric evidence rules", () => {
  test("v2: a skill citing only its own label fails (no self-citing)", () => {
    const draft = validApplicationDraftV2();
    draft.cv.skills[0].items[0].evidenceIds = ["profile:skill:0:0"];
    expect(errors(draft)).toContain("SKILL_SELF_CITED");
  });

  test("v1: the same self-cited skill is only a warning; the draft fails only on CONTRACT_DOWNGRADE", () => {
    const review = reviewApplicationDraft(validApplicationDraft(), brief);
    // Joe, PR #19 follow-up (Sam LOW-2): v1 against a v2 brief is an error.
    expect(review.findings.filter((item) => item.severity === "error").map((item) => item.code)).toEqual(["CONTRACT_DOWNGRADE"]);
    expect(review.findings.find((item) => item.code === "SKILL_SELF_CITED")?.severity).toBe("warning");
  });

  test("v2: a summary with no work evidence fails", () => {
    const draft = validApplicationDraftV2();
    draft.cv.summary.evidenceIds = ["profile:experience:0", "profile:skill:0:0"];
    expect(errors(draft)).toContain("SUMMARY_WITHOUT_PROOF");
  });

  test("v2: a bullet citing only the role header fails", () => {
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[1].evidenceIds = ["profile:experience:0"];
    expect(errors(draft)).toContain("BULLET_WITHOUT_WORK_EVIDENCE");
  });

  test("keyword-list headlines and tool-list summaries are flagged", () => {
    const draft = validApplicationDraftV2();
    draft.cv.headline.text = "Platform Engineer | Python | Terraform";
    draft.cv.summary.text = "Platform engineer working with Python, Terraform, Docker, Kubernetes, Ansible and Jenkins on cloud delivery automation, maintaining deployment tooling with the security team and keeping infrastructure changes repeatable for every platform team.";
    const found = codes(draft);
    expect(found).toContain("HEADLINE_KEYWORD_LIST");
    expect(found).toContain("SUMMARY_TOOL_LIST");
  });

  test("a repeated evidence priority is flagged (AUDIT.md F8)", () => {
    const draft = validApplicationDraftV2();
    draft.strategy.evidencePriorities.push({ ...draft.strategy.evidencePriorities[0], priority: 3 });
    expect(codes(draft)).toContain("DUPLICATE_PRIORITY");
  });

  test("banned phrases still block a v2 draft (#17)", () => {
    const draft = validApplicationDraftV2();
    draft.cv.skills[0].items[0].text = "Results-driven Python";
    expect(errors(draft)).toContain("BANNED_PHRASE");
  });

  test("v2 caps skills at 5 groups, 6 items per group and 24 items", () => {
    const draft = validApplicationDraftV2();
    const item = draft.cv.skills[0].items[0];
    expect(ApplicationDraft.safeParse({ ...draft, cv: { ...draft.cv, skills: Array.from({ length: 6 }, (_, i) => ({ group: `Group ${i}`, items: [item] })) } }).success).toBe(false);
    expect(ApplicationDraft.safeParse({ ...draft, cv: { ...draft.cv, skills: [{ group: "Too many", items: Array.from({ length: 7 }, () => item) }] } }).success).toBe(false);
    expect(ApplicationDraft.safeParse({ ...draft, cv: { ...draft.cv, skills: Array.from({ length: 5 }, (_, i) => ({ group: `Group ${i}`, items: Array.from({ length: 6 }, () => item) })) } }).success).toBe(false);
    expect(ApplicationDraft.safeParse({ ...draft, cv: { ...draft.cv, skills: Array.from({ length: 4 }, (_, i) => ({ group: `Group ${i}`, items: Array.from({ length: 6 }, () => item) })) } }).success).toBe(true);
    expect(ApplicationDraft.safeParse(draft).success).toBe(true);
  });
});

describe("render: contract v2 skill groups", () => {
  test("prints the draft's groups in the draft's order, not the profile's categories", () => {
    const draft = validApplicationDraftV2();
    draft.cv.skills = [
      { group: "Infrastructure as code", items: [{ text: "Terraform", evidenceIds: ["profile:experience:0:achievement:0"] }] },
      { group: "Delivery automation", items: [{ text: "Python", evidenceIds: ["profile:experience:0:achievement:0"] }] },
    ];
    const cv = renderCvTypst({ profile: applicationProfile, draft, outDir: "/tmp/application", template: "modern" });
    expect(cv).toContain('(label: "Infrastructure as code", value: "Terraform")');
    expect(cv.indexOf("Infrastructure as code")).toBeLessThan(cv.indexOf("Delivery automation"));
    expect(cv).not.toContain('label: "Automation"');
  });

  test("v1 drafts still render under the profile's categories", () => {
    const cv = renderCvTypst({ profile: applicationProfile, draft: validApplicationDraft(), outDir: "/tmp/application", template: "modern" });
    expect(cv).toContain('label: "Automation"');
  });
});

// QA (PR #18 @ 31e1b4a): a declared gap licenses disclosure clause by clause, not a whole sentence.
describe("QA 31e1b4a: label-only claims hiding behind a declared disclosure", () => {
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
    "Although new to Kubernetes, I run it in production.",
    "I run Kubernetes clusters rather than plain VMs.",
    "I chose Kubernetes instead of Nomad for every client.",
    "I led Kubernetes migrations; I have not used Helm.",
    "I have not used Kubernetes, but I have deployed K8s clusters for every client.",
    "I am currently learning Kubernetes and already run it for clients.",
    "I have not used Kubernetes however I run K8s clusters daily.",
  ])("declared claim %p still fails with LABEL_ONLY_CLAIM", (sentence) => {
    expect(letterCodes(sentence)).toContain("LABEL_ONLY_CLAIM");
  });
  test.each([
    "I have not run Kubernetes in production yet, but I run Docker Swarm.",
    "My orchestration experience is Docker Swarm rather than Kubernetes.",
    "I have not used Kubernetes yet, but I would learn it quickly.",
    "I have not used Kubernetes, but it is on my list.",
    "I have not run Kubernetes, though I would enjoy it.",
    "I have not used Kubernetes yet, but I plan to learn to run it.",
  ])("declared disclosure %p passes", (sentence) => {
    expect(letterCodes(sentence)).not.toContain("LABEL_ONLY_CLAIM");
  });
  // Sam (PR #18 @ 82438a7) MED: "You…/Your…" alone does not make a sentence employer-only.
  test.each([
    "You will be hiring someone who has run Kubernetes in production for five years.",
    "Your next hire has run Ansible and Kubernetes at scale for years.",
  ])("candidate claim %p fails even without first person", (sentence) => {
    expect(letterCodes(sentence, [])).toContain("LABEL_ONLY_CLAIM");
  });
  // QA (PR #18 @ 442d7e1): pin each half of aboutEmployerOnly separately (mutants SC66, SC67 survived).
  test.each([
    "Your team gets an engineer who has run Kubernetes in production for years.",
    "You get a Kubernetes operator with five years in production.",
  ])("candidate claim %p dressed as an employer sentence fails", (sentence) => {
    expect(letterCodes(sentence, [])).toContain("LABEL_ONLY_CLAIM");
  });
  test.each(["Your team uses Kubernetes.", "Your posting asks for Kubernetes."])("employer-only %p passes even when undeclared", (sentence) => {
    expect(letterCodes(sentence, [])).not.toContain("LABEL_ONLY_CLAIM");
  });
  test.each([
    "I have not used Kubernetes. However, I run it daily.",
    "I have never used Kubernetes. I run it daily.",
    "Your team uses Kubernetes. I run it daily.",
    "I have not used Kubernetes; however, I run it daily.",
  ])("a claim split from its disclosure %p still fails", (sentence) => {
    expect(letterCodes(sentence)).toContain("LABEL_ONLY_CLAIM");
    expect(letterCodes(sentence, [])).toContain("LABEL_ONLY_CLAIM");
  });
  test.each([
    "I have not used Kubernetes. I run Docker Swarm daily.",
    "I have not used Kubernetes yet; however, I am keen to learn it.",
    // QA (PR #18 @ 442d7e1): pin refersBackHandsOn and the learning guard (SC45, SC61-SC65 survived).
    "I have not used Kubernetes. I have not run it either.",
    "I have not used Kubernetes. I am keen to learn to run it.",
    "I have not used Kubernetes yet, but I am keen to learn to run it.",
    "I have not used Kubernetes. It is on my list.",
    "Your posting asks for Kubernetes. It is a platform you run at scale.",
    "I run Docker Swarm daily. I run it for every client.",
  ])("a disclosure followed by an unrelated sentence %p passes", (sentence) => {
    expect(letterCodes(sentence)).not.toContain("LABEL_ONLY_CLAIM");
  });
  test("only the declared term is licensed, and its alias declares it", () => {
    expect(letterCodes("I have not run Kubernetes in production yet.", ["Helm"])).toContain("LABEL_ONLY_CLAIM");
    expect(letterCodes("I have not run Kubernetes in production yet.", ["K8s"])).not.toContain("LABEL_ONLY_CLAIM");
  });
  test("an implied match (PowerShell for scripting) is not a mention of a label-only term", () => {
    const profile = structuredClone(applicationProfile);
    profile.skills = [{ category: "Automation", skills: ["Python", "Terraform", "Scripting"] }];
    const posting = "Platform Engineer. Requirements: Python, Terraform, scripting. Build secure delivery automation.";
    const local = buildApplicationBrief({ profile, posting, company: "Acme", role: "Platform Engineer" });
    expect(local.evidenceMatrix.labelOnly).toContain("scripting");
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[0].text = "Automated cloud environment delivery with Python, Terraform and PowerShell.";
    expect(reviewApplicationDraft(draft, local).findings.map((finding) => finding.code)).not.toContain("LABEL_ONLY_CLAIM");
  });
  test("a requirement proven through an alias work line is not a gap when claimed by name", () => {
    const profile = structuredClone(applicationProfile);
    profile.experience![0].responsibilities = ["Maintained deployment tooling on K8s with the security team."];
    const local = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
    expect(local.evidenceMatrix.rows.find((row) => row.requirement === "kubernetes")?.status).toBe("proven");
    const draft = validApplicationDraftV2();
    draft.cv.experience[0].bullets[1].text = "Maintained deployment tooling on Kubernetes with the security team.";
    expect(reviewApplicationDraft(draft, local).findings.map((finding) => finding.code)).not.toContain("GAP_AS_CLAIM");
  });
  test("a declared gap still cannot be claimed in a disclosing sentence (GAP_AS_CLAIM)", () => {
    const draft = validApplicationDraftV2();
    draft.coverLetter.paragraphs[1].text += " Although new to Kubernetes, I run it in production.";
    expect(reviewApplicationDraft(draft, brief).findings.map((finding) => finding.code)).toContain("GAP_AS_CLAIM");
    const honest = validApplicationDraftV2();
    honest.coverLetter.paragraphs[1].text += " I have not used Kubernetes yet.";
    expect(reviewApplicationDraft(honest, brief).findings.map((finding) => finding.code)).not.toContain("GAP_AS_CLAIM");
  });
});
