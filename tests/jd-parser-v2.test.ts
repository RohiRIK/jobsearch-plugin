import { describe, expect, test } from "bun:test";
import { ParsedJD, summarizeText } from "../scripts/jobs/summarize.js";
import { scoreJob } from "../scripts/match/score-job.js";
import { matchProfileSkill } from "../src/skill-vocabulary.js";
import { buildApplicationBrief, reviewApplicationDraft } from "../src/application-draft.js";
import type { Profile } from "../src/profile-schemas.js";
import { applicationProfile, validApplicationDraft } from "./fixtures/application.js";

// Synthetic identity-led posting modelled on AUDIT.md section 2a. No figures:
// the parser must not depend on any metric in the ad.
const IDENTITY_POSTING = `Senior Identity Engineer
Example Corp · Remote

About the role
You will own the Microsoft identity platform.

Responsibilities
- Own Conditional Access, PIM and identity governance across client tenants.
- Run Microsoft Sentinel detections and automate responses with Microsoft Graph.

Requirements
- Hands-on Entra ID, Intune and Defender for Endpoint.
- Scripting for identity operations.
- Experience with Azure and cloud security.

Nice to have
- Terraform, Kubernetes.
- Okta.`;

const identityProfile: Profile = {
  identity: { name: "Test User", languages: ["English"] },
  skills: [
    { category: "Identity", skills: ["Microsoft Entra ID", "Conditional Access", "PIM", "Intune", "Microsoft Defender for Endpoint"] },
    { category: "Automation", skills: ["PowerShell", "Microsoft Graph"] },
    { category: "Cloud", skills: ["Azure", "Microsoft Sentinel"] },
  ],
  experience: [
    {
      title: "Identity Engineer",
      company: "Example Labs",
      startDate: "2020",
      endDate: "Present",
      responsibilities: ["Designed Conditional Access and PIM policies in Entra ID for every client tenant.", "Automated Intune and Defender for Endpoint reporting with PowerShell."],
    },
  ],
};

describe("JD parser v2: ranking by position in the ad", () => {
  test("required skills follow the posting order, not the vocabulary order", () => {
    const sentinelFirst = summarizeText("Requirements:\n- Sentinel, Purview and Python.");
    expect(sentinelFirst.requiredSkills).toEqual(["sentinel", "purview", "python"]);
    const pythonFirst = summarizeText("Requirements:\n- Python, Purview and Sentinel.");
    expect(pythonFirst.requiredSkills).toEqual(["python", "purview", "sentinel"]);
  });

  test("requirements carry rank, weight, section and the source line", () => {
    const jd = summarizeText(IDENTITY_POSTING);
    const ranks = jd.requirements.map((requirement) => requirement.rank);
    expect(ranks).toEqual(ranks.map((_, index) => index + 1));
    const entra = jd.requirements.find((requirement) => requirement.term === "entra id")!;
    expect(entra).toMatchObject({ rank: 1, section: "required", required: true, generic: false, weight: 0.8 });
    expect(entra.quote).toBe("Hands-on Entra ID, Intune and Defender for Endpoint.");
    expect(IDENTITY_POSTING.slice(entra.position, entra.position + "entra id".length).toLowerCase()).toBe("entra id");
    // requiredSkills and niceToHaveSkills are projections of the ranked list.
    expect(jd.requiredSkills).toEqual(jd.requirements.filter((requirement) => requirement.required).map((requirement) => requirement.term));
    expect(jd.niceToHaveSkills).toEqual(["terraform", "kubernetes", "okta"]);
  });

  test("section weight: title > requirements > responsibilities > nice-to-have", () => {
    const jd = summarizeText(IDENTITY_POSTING, { title: "Senior Sentinel Engineer" });
    const section = (term: string) => jd.requirements.find((requirement) => requirement.term === term);
    expect(section("sentinel")).toMatchObject({ section: "title", rank: 1, weight: 1 });
    expect(section("intune")!.section).toBe("required");
    expect(section("conditional access")!.section).toBe("responsibilities");
    expect(section("okta")!.section).toBe("nice-to-have");
    expect(section("intune")!.rank).toBeLessThan(section("conditional access")!.rank);
    expect(section("conditional access")!.rank).toBeLessThan(section("okta")!.rank);
  });

  test("broad umbrella terms rank below specific requirements in the same section", () => {
    const jd = summarizeText("Requirements:\n- Cloud security experience with Purview.");
    expect(jd.requiredSkills[0]).toBe("purview");
    expect(jd.requirements.find((requirement) => requirement.term === "cloud")).toMatchObject({ generic: true, weight: 0.4 });
  });

  test("parsed JSON written before requirements existed still validates", () => {
    const legacy = { remote: "unknown", yearsExperience: null, requiredSkills: ["python"], niceToHaveSkills: [], languages: [], education: null, salary: null };
    const parsed = ParsedJD.parse(legacy);
    expect(parsed.requirements).toEqual([]);
  });
});

describe("JD parser v2: identity and Microsoft security vocabulary", () => {
  test("recognises the identity and Microsoft security terms", () => {
    const jd = summarizeText(
      "Requirements:\n- Conditional Access, PIM, Entra ID, Sentinel, Purview, Microsoft Graph, Intune, Zero Trust, KQL, DLP.\n- Defender for Identity, Defender for Cloud and Defender for Office 365.",
    );
    for (const term of ["conditional access", "pim", "entra id", "sentinel", "purview", "microsoft graph", "intune", "zero trust", "kql", "dlp", "defender for identity", "defender for cloud", "defender for office 365"]) {
      expect(jd.requiredSkills).toContain(term);
    }
  });

  test("a term inside a longer recognised term is not a second requirement", () => {
    const jd = summarizeText("Requirements:\n- Defender for Endpoint rollout.");
    expect(jd.requiredSkills).toEqual(["defender for endpoint"]);
  });

  test("spellings in one alias group collapse to the highest-ranked one", () => {
    expect(summarizeText("Requirements:\n- Entra ID (Azure AD) administration.").requiredSkills).toEqual(["entra id"]);
    expect(summarizeText("Requirements:\n- Privileged Identity Management (PIM).").requiredSkills).toEqual(["privileged identity management"]);
  });

  test("Defender XDR and Defender are aliases; Graph API and Microsoft Graph are aliases", () => {
    expect(matchProfileSkill("defender xdr", "Microsoft Defender")).toBe("alias");
    expect(matchProfileSkill("graph api", "Microsoft Graph")).toBe("alias");
    expect(matchProfileSkill("pim", "Privileged Identity Management")).toBe("alias");
  });
});

describe("JD parser v2: gap logic", () => {
  test("PowerShell satisfies a scripting requirement, one way only", () => {
    expect(matchProfileSkill("scripting", "PowerShell")).toBe("implied");
    expect(matchProfileSkill("powershell", "Scripting")).toBeNull();
    const result = scoreJob(summarizeText("Requirements:\n- Scripting for identity operations."), identityProfile);
    expect(result.gaps).not.toContain("scripting");
    expect(result.skillEvidence).toContainEqual({ requirement: "scripting", profileSkill: "PowerShell", matchType: "implied" });
  });

  test("a missing nice-to-have is a lower-severity gap: listed, but no score penalty", () => {
    const withNice = scoreJob(summarizeText("Requirements:\n- Intune.\nNice to have:\n- Kubernetes, PIM."), identityProfile);
    const withoutNice = scoreJob(summarizeText("Requirements:\n- Intune."), identityProfile);
    expect(withNice.niceGaps).toEqual(["kubernetes"]);
    expect(withNice.gaps).not.toContain("kubernetes");
    expect(withNice.breakdown.skills).toBeGreaterThanOrEqual(withoutNice.breakdown.skills);
    expect(withoutNice.niceGaps).toEqual([]);
  });

  test("nice-to-have gaps are recorded even when the posting lists no required skills", () => {
    const result = scoreJob(summarizeText("Nice to have:\n- Okta."), identityProfile);
    expect(result.niceGaps).toEqual(["okta"]);
  });

  test("the plan leads with the top-ranked supported requirement and never asks to prove a nice-to-have gap", () => {
    const brief = buildApplicationBrief({ profile: identityProfile, posting: IDENTITY_POSTING, company: "Example Corp", role: "Senior Identity Engineer" });
    expect(brief.plan.mustProve[0]).toBe("Entra Id");
    expect(brief.plan.roleThesis).toContain("proves Entra Id");
    expect(brief.plan.mustProve).not.toContain("Kubernetes");
    expect(brief.plan.mustProve).not.toContain("Terraform");
    expect(brief.plan.gapDetails).toEqual([
      { requirement: "Terraform", severity: "nice-to-have" },
      { requirement: "Kubernetes", severity: "nice-to-have" },
      { requirement: "Okta", severity: "nice-to-have" },
    ]);
    expect(brief.plan.openGaps).toEqual(["Terraform", "Kubernetes", "Okta"]);
    expect(brief.niceGaps).toEqual(["terraform", "kubernetes", "okta"]);
    expect(brief.gaps).not.toContain("scripting");
  });

  test("must-have gaps are listed before nice-to-have gaps", () => {
    const posting = "Platform Engineer. Requirements: Python, Rust.\nNice to have:\n- Okta.";
    const brief = buildApplicationBrief({ profile: applicationProfile, posting, company: "Acme", role: "Platform Engineer" });
    expect(brief.plan.gapDetails).toEqual([
      { requirement: "Rust", severity: "must-have" },
      { requirement: "Okta", severity: "nice-to-have" },
    ]);
  });

  test("review rejects a CV that claims a nice-to-have gap", () => {
    const posting = "Platform Engineer. Requirements: Python, Terraform.\nNice to have:\n- Kubernetes.";
    const brief = buildApplicationBrief({ profile: applicationProfile, posting, company: "Acme", role: "Platform Engineer" });
    expect(brief.niceGaps).toEqual(["kubernetes"]);
    const draft = validApplicationDraft();
    draft.cv.skills.push({ text: "Kubernetes", evidenceIds: ["profile:skill:0:0"] });
    const codes = reviewApplicationDraft(draft, brief).findings.map((finding) => finding.code);
    expect(codes).toContain("GAP_AS_CLAIM");
  });
});
