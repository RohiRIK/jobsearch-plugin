import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getPageCount } from "../scripts/verify-ats.js";
import { resolveTypstCommand } from "../src/resolve-bin.js";

const ROOT = resolve(import.meta.dir, "..");
const TYPST_COMMAND = resolveTypstCommand(ROOT);
const WORK_DIR = join(ROOT, ".tmp-modern-cv-template-test");
const SOURCE = join(WORK_DIR, "modern-regression.typ");
const PDF = join(WORK_DIR, "modern-regression.pdf");

const profileMarker = "PROFILE-MARKER Cloud security engineer focused on reliable identity automation.";
const experienceBullets = [
  "BULLET-01 Administered enterprise identity controls with documented change review.",
  "BULLET-02 Automated repeatable tenant checks with PowerShell and Microsoft Graph.",
  "BULLET-03 Implemented Conditional Access policies from approved requirements.",
  "BULLET-04 Maintained endpoint compliance policies across supported platforms.",
  "BULLET-05 Built auditable reports for security configuration changes.",
  "BULLET-06 Integrated alert triage with documented incident procedures.",
  "BULLET-07 Standardized access reviews and account lifecycle operations.",
  "BULLET-08 Partnered with service owners on production change planning.",
  "BULLET-09 Wrote operational runbooks for common support scenarios.",
  "BULLET-10 Improved monitoring coverage for identity and endpoint events.",
  "BULLET-11 Tested recovery procedures before scheduled platform changes.",
  "BULLET-12 Reduced manual administration through reusable automation.",
  "BULLET-13 Reviewed privileged access assignments with system owners.",
  "BULLET-14 Supported cloud migrations with staged validation checks.",
  "BULLET-15 Documented service dependencies and escalation paths.",
  "BULLET-16 Investigated authentication failures using platform logs.",
  "BULLET-17 Added regression checks for high-risk configuration settings.",
  "BULLET-18 Presented concise implementation notes to technical stakeholders.",
] as const;

function typstString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function tuple(values: readonly string[]): string {
  return `(\n${values.map((value) => `      ${typstString(value)},`).join("\n")}\n    )`;
}

function fixtureSource(): string {
  const roles = [0, 1, 2].map((roleIndex) => {
    const bullets = experienceBullets.slice(roleIndex * 6, roleIndex * 6 + 6);
    return `    (\n      date: "${2024 - roleIndex * 2}-${roleIndex === 0 ? "present" : 2026 - roleIndex * 2}",\n      title: "Role ${roleIndex + 1}",\n      company: "Company ${roleIndex + 1}",\n      location: "Location ${roleIndex + 1}",\n      content: ${tuple(bullets)},\n    ),`;
  }).join("\n");

  return `#import "/templates/cv/modern/template.typ": cv-body

#show: cv-body(
  name: "Test",
  lastname: "Candidate",
  contact: ("candidate@example.com", "+1 202 555 0147", "https://linkedin.example/candidate"),
  profile: ${typstString(profileMarker)},
  skills: (
    (label: "Python", level: 0),
    (label: "PowerShell", level: 5),
    (label: "Microsoft Graph", level: 3),
    (label: "Entra ID", level: 4),
    (label: "Conditional Access", level: 2),
    (label: "Microsoft Intune", level: 5),
  ),
  experience: (
${roles}
  ),
  projects: (
    (
      title: "Document Quality Gate",
      url: "https://example.com/quality-gate",
      description: "A deterministic document compilation and inspection workflow.",
      highlights: ("PROJECT-BULLET-01 Compiles source before inspection.", "PROJECT-BULLET-02 Preserves literal URLs in ATS text."),
    ),
    (
      title: "Identity Review Automation",
      url: "https://example.com/identity-review",
      description: "Reusable checks for access-review preparation and evidence collection.",
      highlights: ("PROJECT-BULLET-03 Produces review-ready configuration summaries.", "PROJECT-BULLET-04 Keeps source evidence attached to each finding."),
    ),
    (
      title: "Operational Runbook Library",
      url: "https://example.com/runbooks",
      description: "Versioned procedures for common identity and endpoint support scenarios.",
      highlights: ("PROJECT-BULLET-05 Documents prerequisites and rollback steps.", "PROJECT-BULLET-06 Uses peer review before operational release."),
    ),
  ),
  education: (
    (year: "2021-2022", degree: "Cyber and Information Security", institution: "Example College", field: "Identity and cloud security"),
    (year: "2020", degree: "Infrastructure Operations", institution: "Example Institute", field: "Systems administration and automation"),
  ),
  certifications: (
    (name: "Example Security Certification", date: "2022"),
    (name: "Example Cloud Certification", date: "2023"),
    (name: "Example Automation Certification", date: "2024"),
  ),
)
`;
}

function typstCommand(): string[] {
  if (!TYPST_COMMAND) throw new Error("Typst CLI not found; install dependencies or Typst");
  return TYPST_COMMAND;
}

async function runTypst(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([...typstCommand(), ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

describe("modern CV Typst template", () => {
  beforeAll(() => {
    if (!TYPST_COMMAND) throw new Error("Typst CLI not found; install dependencies or Typst");
    rmSync(WORK_DIR, { recursive: true, force: true });
    mkdirSync(WORK_DIR, { recursive: true });
    writeFileSync(SOURCE, fixtureSource());
  });

  afterAll(() => {
    if (process.env.KEEP_MODERN_CV_TEST_OUTPUT !== "1") {
      rmSync(WORK_DIR, { recursive: true, force: true });
    }
  });

  test("compiles a representative two-page CV", async () => {
    const result = await runTypst(["compile", "--root", ROOT, SOURCE, PDF]);
    expect(result.code, result.stderr).toBe(0);
    expect(existsSync(PDF)).toBe(true);
    expect(getPageCount(PDF)).toBe(2);
  });

  test("renders the profile and every supplied experience bullet", async () => {
    const profile = await runTypst(["query", "--root", ROOT, SOURCE, "<cv-profile>", "--field", "value"]);
    const bullets = await runTypst(["query", "--root", ROOT, SOURCE, "<cv-entry-item>", "--field", "value"]);
    expect(profile.code, profile.stderr).toBe(0);
    expect(bullets.code, bullets.stderr).toBe(0);

    expect(JSON.parse(profile.stdout)).toEqual([profileMarker]);
    expect(JSON.parse(bullets.stdout).slice(0, experienceBullets.length)).toEqual(experienceBullets);
    expect(profile.stdout).not.toContain("text(size:");
  });

  test("uses plain skill labels and fallback-safe fonts", () => {
    const modern = readFileSync(join(ROOT, "templates", "cv", "modern", "template.typ"), "utf8");
    const designSystem = readFileSync(join(ROOT, "templates", "design-system.typ"), "utf8");

    expect(modern).not.toContain("skill-bar(");
    expect(modern).toContain("clean-skill-label(skill.label)");
    expect(designSystem).toContain('"Liberation Sans"');
    expect(designSystem).toContain('"DejaVu Sans"');
  });
});
