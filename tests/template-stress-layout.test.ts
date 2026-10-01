import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderCoverLetterTypst, renderCvTypst } from "../src/application-renderers.js";
import { resolveTypstCommand } from "../src/resolve-bin.js";
import { checkLayout } from "../scripts/verify-layout.js";
import { applicationProfile, validApplicationDraft } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");
const SCRATCH = join(ROOT, "data", "scratch");

async function compile(source: string, pdf: string): Promise<void> {
  const typst = resolveTypstCommand(ROOT);
  if (!typst) throw new Error("Typst CLI not found");
  const proc = Bun.spawn([...typst, "compile", "--root", ROOT, source, pdf], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  expect(await proc.exited).toBe(0);
  expect(`${stdout}${stderr}`.includes("error:")).toBe(false);
  expect(existsSync(pdf)).toBe(true);
}

function workDir(): string {
  mkdirSync(SCRATCH, { recursive: true });
  return mkdtempSync(join(SCRATCH, "template-stress-"));
}

function adversarialProfile() {
  const profile = structuredClone(applicationProfile);
  profile.identity.name = "Alexandria Maximiliana von Sicherheitsarchitektur";
  profile.identity.firstName = "Alexandria";
  profile.identity.lastName = "Maximiliana von Sicherheitsarchitektur";
  profile.identity.email = "alexandria.maximiliana.cloudsecurity.engineer@example.com";
  profile.identity.phone = "+49 30 1234 5678 9012";
  profile.identity.location = "Friedrichshain-Kreuzberg, Berlin, Germany";
  profile.identity.linkedin = "https://linkedin.com/in/placeholder";
  return profile;
}

function adversarialDraft() {
  const draft = validApplicationDraft();
  draft.role = "Senior Cloud Security and Identity Solution Engineering Architect";
  draft.company = "International Enterprise Security Transformation and Platform Engineering GmbH";
  draft.cv.headline.text = "Cloud Security, Identity and Solution Engineering Architect";
  draft.cv.summary.text = "Designs evidence-grounded identity, endpoint, cloud-security and automation solutions for complex enterprise environments while keeping operational delivery readable, auditable, and constrained.";
  draft.coverLetter.recipient = "Hiring Committee for Cloud Security and Identity Engineering";
  draft.coverLetter.paragraphs = [
    { text: "I am applying because the role combines enterprise identity, cloud security, stakeholder discovery, and practical delivery. I work from verifiable implementation evidence and describe gaps directly rather than turning adjacent knowledge into claimed experience.", evidenceIds: [] },
    { text: "My experience includes Microsoft 365 and Entra ID security delivery, Conditional Access hardening, migration discovery, and automation-oriented solution design. I would bring a structured, client-facing approach to technical discovery and concise implementation communication.", evidenceIds: [] },
  ];
  return draft;
}

function bankingSource(): string {
  return `#import "/templates/cv/banking/template.typ": cv-body
#show: cv-body(
  name: "Alexandria",
  lastname: "Maximiliana von Sicherheitsarchitektur",
  contact: ("alexandria.maximiliana.cloudsecurity.engineer@example.com", "+49 30 1234 5678 9012", "Friedrichshain-Kreuzberg, Berlin, Germany"),
  profile: "Evidence-grounded cloud security and identity engineer with long but normally wrapping prose used to test page-flow resilience across the banking template.",
  sections: (
    (title: "Experience", body: [#text(weight: "bold")[Senior Cloud Security and Identity Solution Engineering Architect]\\
      Delivered long-form enterprise security discovery, solution design, and migration-support statements that must remain within normal page boundaries without overlapping section rules.]),
    (title: "Skills", body: [Microsoft 365 · Entra ID · Conditional Access · Azure · Microsoft Sentinel · SAML · SCIM · Python automation · Bash automation]),
  ),
)
`;
}

describe("adversarial Typst template layout", () => {
  test("cover templates use executable content blocks rather than rendering control flow literally", () => {
    for (const template of ["modern", "classic", "casual"]) {
      const source = readFileSync(join(ROOT, "templates", "cover", template, "template.typ"), "utf8");
      expect(source, template).not.toContain("[#{");
    }
  });

  test("keeps every application-supported template inside page bounds with hostile but realistic fields", async () => {
    const dir = workDir();
    try {
      const profile = adversarialProfile();
      const draft = adversarialDraft();
      const sources: Array<[string, string]> = [
        ["modern-cv", renderCvTypst({ profile, draft, outDir: dir, template: "modern" })],
        ...(["modern", "classic", "casual"] as const).map((template): [string, string] => [
          `cover-${template}`,
          renderCoverLetterTypst({ profile, draft, outDir: dir, template, date: "2026-08-23" }),
        ]),
        ["banking-cv-direct", bankingSource()],
      ];

      for (const [name, sourceText] of sources) {
        const source = join(dir, `${name}.typ`);
        const pdf = join(dir, `${name}.pdf`);
        writeFileSync(source, sourceText);
        await compile(source, pdf);
        const report = await checkLayout(pdf, source);
        expect(report.pass, `${name}: ${report.error ?? JSON.stringify(report.pages)}`).toBe(true);
        expect(report.pages.length, name).toBeGreaterThan(0);
        expect(report.pages.every((page) => page.ruleCollisions.length === 0), name).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
