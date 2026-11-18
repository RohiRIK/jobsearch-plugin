import { describe, expect, test } from "bun:test";
import { buildApplicationBrief, buildEvidenceLedger } from "../src/application-draft.js";
import { buildEvidenceMatrix } from "../src/evidence-matrix.js";
import type { Profile } from "../src/profile-schemas.js";
import { summarizeText } from "../scripts/jobs/summarize.js";
import { SKILL_TERMS } from "../src/skill-vocabulary.js";

// Synthetic identity engineer. Okta is a saved skill label with no work line
// behind it; Kubernetes and Terraform appear nowhere in the profile.
const profile: Profile = {
  identity: { name: "Alex Rivera", email: "alex@example.com", headline: "Identity Engineer | Entra ID, Conditional Access, PIM, Intune" },
  skills: [
    { category: "Identity", skills: ["Entra ID", "Conditional Access", "PIM", "Okta"] },
    { category: "Scripting", skills: ["PowerShell"] },
  ],
  experience: [
    {
      title: "Identity Engineer",
      company: "Example Consulting",
      startDate: "2022",
      endDate: "Present",
      responsibilities: [
        "Designed Conditional Access policies and PIM role assignments for every client tenant.",
        "Wrote PowerShell and Microsoft Graph scripts that map legacy GPOs to Intune configuration profiles.",
        "Ran Sentinel analytics rules for sign-in anomalies across client tenants.",
      ],
      achievements: ["Replaced manual Conditional Access reviews with a scripted export used for every client tenant."],
    },
  ],
  projects: [
    {
      slug: "graph-audit",
      name: "Graph Audit",
      kind: "personal",
      summary: "Open-source Microsoft Graph tool that audits Conditional Access drift.",
      domains: ["identity-access", "automation"],
      stack: ["PowerShell", "Microsoft Graph"],
    },
  ],
};

const posting = `Senior Identity Engineer
Contoso · Remote

Requirements:
- Conditional Access and PIM design in Entra ID
- Intune and Sentinel operations
- Scripting for automation
- Okta federation

Nice to have:
- Kubernetes
- Terraform`;

function setup(p: Profile = profile, text = posting) {
  const role = "Senior Identity Engineer";
  const jd = summarizeText(text, { company: "Contoso", title: role });
  const evidence = buildEvidenceLedger(p, text, "Contoso", role, jd);
  return { jd, evidence, matrix: buildEvidenceMatrix({ jd, evidence, profile: p }) };
}

describe("requirement → evidence matrix (AUDIT.md §4.1)", () => {
  test("rows follow the parser's posting rank, with rank, weight, section and quote", () => {
    const { jd, matrix } = setup();
    expect(matrix.rows.map((row) => row.requirement)).toEqual(jd.requirements.map((r) => r.term).slice(0, matrix.rows.length));
    const ranks = matrix.rows.map((row) => row.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    const ca = matrix.rows.find((row) => row.requirement === "conditional access")!;
    expect(ca).toMatchObject({ section: "required", required: true, status: "proven", strength: "direct-work" });
    expect(ca.weight).toBeGreaterThan(0);
    expect(ca.quote).toContain("Conditional Access");
  });

  test("maps a requirement to the specific work lines that prove it, achievements first, labels last", () => {
    const { matrix } = setup();
    const ca = matrix.rows.find((row) => row.requirement === "conditional access")!;
    const ids = ca.evidence.map((item) => item.evidenceId);
    expect(ids[0]).toBe("profile:experience:0:achievement:0");
    expect(ids).toContain("profile:experience:0:responsibility:0");
    expect(ids.indexOf("profile:project:graph-audit")).toBeGreaterThan(ids.indexOf("profile:experience:0:responsibility:0"));
    expect(ids[ids.length - 1]).toMatch(/^profile:skill:/);
    expect(ca.use).toEqual(expect.arrayContaining(["summary", "skills", "experience"]));
  });

  test("missing evidence yields a gap, never a claim slot", () => {
    const { matrix } = setup();
    for (const term of ["kubernetes", "terraform"]) {
      const row = matrix.rows.find((item) => item.requirement === term)!;
      expect(row).toMatchObject({ status: "gap", strength: null, evidence: [], use: [] });
      expect(matrix.gaps).toContain(term);
    }
    expect(matrix.lines.flatMap((line) => line.requirements)).not.toContain("kubernetes");
  });

  test("a requirement backed only by a skill label is label-only: not a gap, not proof", () => {
    const { matrix } = setup();
    const okta = matrix.rows.find((row) => row.requirement === "okta")!;
    expect(okta).toMatchObject({ status: "label-only", strength: "skill-label-only", use: [] });
    expect(matrix.labelOnly).toContain("okta");
    expect(matrix.gaps).not.toContain("okta");
  });

  // QA (PR #18): labels and credentials never become evidence priorities.
  test("lines carry only work and project evidence, never skill labels or credentials", () => {
    const p = structuredClone(profile);
    p.certifications = [{ name: "Conditional Access Specialist", date: "2024" }];
    const { matrix } = setup(p);
    expect(matrix.rows.some((row) => row.evidence.some((item) => item.strength === "skill-label-only"))).toBe(true);
    for (const line of matrix.lines) {
      expect(["direct-work", "work-project", "personal-project"]).toContain(line.strength);
      expect(line.evidenceId).not.toMatch(/^profile:(?:skill|certification|education):/);
    }
  });

  test("job-sourced items are never evidence, whatever their kind", () => {
    const { jd, evidence } = setup();
    const forged = [...evidence, { id: "job:kubernetes", source: "job", kind: "skill", text: "Kubernetes" }, { id: "job:terraform", source: "job", kind: "project", text: "Terraform" }] as typeof evidence;
    const matrix = buildEvidenceMatrix({ jd, evidence: forged, profile });
    expect(matrix.gaps).toEqual(expect.arrayContaining(["kubernetes", "terraform"]));
    expect(matrix.rows.flatMap((row) => row.evidence.map((item) => item.evidenceId)).some((id) => id.startsWith("job:"))).toBe(false);
  });

  test("PowerShell work satisfies a scripting requirement (implied match)", () => {
    const { matrix } = setup();
    const scripting = matrix.rows.find((row) => row.requirement === "scripting")!;
    expect(scripting.status).toBe("proven");
    expect(scripting.evidence[0]).toMatchObject({ evidenceId: "profile:experience:0:responsibility:1", matchType: "implied" });
  });

  test("classifies personal projects below work", () => {
    const { matrix } = setup();
    const ca = matrix.rows.find((row) => row.requirement === "conditional access")!;
    const project = ca.evidence.find((item) => item.evidenceId === "profile:project:graph-audit")!;
    expect(project.strength).toBe("personal-project");
    expect(project.experienceIndex).toBeNull();
    expect(ca.strength).toBe("direct-work");
  });

  test("identity lines are self-description, never evidence", () => {
    const { matrix } = setup();
    expect(matrix.rows.flatMap((row) => row.evidence.map((item) => item.evidenceId)).some((id) => id.startsWith("profile:identity:"))).toBe(false);
  });

  test("parsed JSON from before requirements[] falls back to the skill lists in order", () => {
    const { jd, evidence } = setup();
    const legacy = { requiredSkills: jd.requiredSkills, niceToHaveSkills: jd.niceToHaveSkills, requirements: [] };
    const matrix = buildEvidenceMatrix({ jd: legacy, evidence, profile });
    expect(matrix.rows.map((row) => row.requirement)).toEqual([...jd.requiredSkills, ...jd.niceToHaveSkills].slice(0, matrix.rows.length));
    expect(matrix.gaps).toEqual(expect.arrayContaining(["kubernetes", "terraform"]));
  });

  // QA (PR #18) S6: JD JSON older than both requirements[] and requiredSkills.
  test("legacy JD JSON with no requirement lists yields an empty matrix instead of throwing", () => {
    const { evidence } = setup();
    type LegacyJd = Parameters<typeof buildEvidenceMatrix>[0]["jd"];
    const legacy = (json: object) => json as unknown as LegacyJd;
    for (const jd of [{}, { niceToHaveSkills: ["kubernetes"] }, { requiredSkills: ["okta"] }].map(legacy)) {
      expect(() => buildEvidenceMatrix({ jd, evidence, profile })).not.toThrow();
    }
    expect(buildEvidenceMatrix({ jd: legacy({}), evidence, profile })).toEqual({ rows: [], gaps: [], labelOnly: [], lines: [] });
    expect(buildEvidenceMatrix({ jd: legacy({ niceToHaveSkills: ["kubernetes"] }), evidence, profile }).gaps).toEqual(["kubernetes"]);
  });

  test("stays fast on a posting that names every vocabulary term and a long profile", () => {
    const big = structuredClone(profile);
    big.experience![0].responsibilities = Array.from({ length: 300 }, (_, i) => `Line ${i}: ${SKILL_TERMS.slice(i % 50, (i % 50) + 8).join(", ")} work.`);
    const text = `Requirements:\n${SKILL_TERMS.map((term) => `- ${term}`).join("\n")}`;
    const started = performance.now();
    const { matrix } = setup(big, text);
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(matrix.rows.length).toBeLessThanOrEqual(30);
  });
});

describe("application plan from the matrix", () => {
  const brief = buildApplicationBrief({ profile, posting, company: "Contoso", role: "Senior Identity Engineer" });

  test("the brief carries the matrix and asks for contract v2", () => {
    expect(brief.contractVersion).toBe(2);
    expect(brief.evidenceMatrix.rows.length).toBeGreaterThan(0);
    expect(brief.prompt).toContain('"evidenceMatrix"');
  });

  // AUDIT.md F8: the role used to be listed once per matched skill.
  test("evidence priorities list each line once, role header first, then the lines it owns", () => {
    const ids = brief.plan.evidencePriorities.map((item) => item.evidenceId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("profile:experience:0");
    expect(ids).toContain("profile:experience:0:achievement:0");
    expect(ids).toContain("profile:experience:0:responsibility:0");
    const line = brief.plan.evidencePriorities.find((item) => item.evidenceId === "profile:experience:0:achievement:0")!;
    expect(line.reason).toMatch(/^Proves conditional access/);
    expect(brief.plan.evidencePriorities.map((item) => item.priority)).toEqual(ids.map((_, index) => index + 1));
  });

  test("gaps stay out of mustProve and the thesis; the thesis leads with direct-work requirements", () => {
    expect(brief.plan.openGaps).toEqual(expect.arrayContaining(["Kubernetes", "Terraform"]));
    expect(brief.plan.mustProve.map((term) => term.toLowerCase())).not.toContain("kubernetes");
    expect(brief.plan.roleThesis).toMatch(/proves Conditional Access/);
    expect(brief.plan.roleThesis).not.toMatch(/proves[^.;]*Okta/);
  });

  // QA (PR #18) S5: Okta is only a saved skill label.
  test("label-only requirements stay out of mustProve", () => {
    expect(brief.evidenceMatrix.labelOnly).toContain("okta");
    expect(brief.plan.mustProve.map((term) => term.toLowerCase())).not.toContain("okta");
    expect(brief.plan.mustProve.map((term) => term.toLowerCase())).toContain("conditional access");
  });

  test("a requirement proven by a work line is not a gap just because no skill label names it", () => {
    const p = structuredClone(profile);
    p.experience![0].responsibilities!.push("Wrote Terraform modules for client landing zones.");
    const withWork = buildApplicationBrief({ profile: p, posting, company: "Contoso", role: "Senior Identity Engineer" });
    expect(withWork.niceGaps).toContain("terraform");
    expect(withWork.plan.openGaps).not.toContain("Terraform");
    expect(withWork.evidenceMatrix.rows.find((row) => row.requirement === "terraform")?.status).toBe("proven");
  });
});
