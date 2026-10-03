import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { renderCvTypst } from "../src/application-renderers.js";
import { CV_LAYOUTS } from "../src/cv-options.js";
import { resolveBin, resolveTypstCommand } from "../src/resolve-bin.js";
import { checkLayout } from "../scripts/verify-layout.js";
import { applicationProfile, validApplicationDraft } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");
let dir: string;

beforeAll(() => {
  // Typst only compiles files inside --root, so the scratch dir lives in the checkout (gitignored).
  mkdirSync(join(ROOT, "data", "scratch"), { recursive: true });
  dir = mkdtempSync(join(ROOT, "data", "scratch", "cv-layouts-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function typst(args: string[]): Promise<string> {
  const cmd = resolveTypstCommand(ROOT);
  if (!cmd) throw new Error("Typst CLI not found");
  const proc = Bun.spawn([...cmd, ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if ((await proc.exited) !== 0) throw new Error(err);
  return out;
}

/** Text of each page, in order. */
async function pages(source: string): Promise<string[]> {
  const pdf = source.replace(/\.typ$/, ".pdf");
  await typst(["compile", "--root", ROOT, source, pdf]);
  const text = Bun.spawnSync([resolveBin("pdftotext")!, "-layout", pdf, "-"]).stdout.toString();
  return text.split("\f").filter((page) => page.trim() !== "");
}

const HEADINGS = ["Profile", "Skills", "Experience", "Projects", "Education", "Certifications"];

/** Section headings in document order, read from their <cv-section> labels — no Poppler needed. */
async function sectionOrder(source: string): Promise<string[]> {
  return JSON.parse(await typst(["query", "--root", ROOT, source, "<cv-section>", "--field", "value"]));
}

// Page boundaries need text extraction; Typst 0.10 and 0.13 share no API for a
// heading's page. pdftotext is a documented shipping dependency, present
// wherever the gate runs, but not on the bare CI runner.
const HAS_PDFTOTEXT = Boolean(resolveBin("pdftotext"));

function draftWithProject() {
  const draft = validApplicationDraft();
  draft.cv.projects = [
    { slug: "delivery-pipeline", description: { text: "Reusable deployment pipeline for platform teams.", evidenceIds: ["profile:project:delivery-pipeline"] }, highlights: [] },
  ];
  return draft;
}

// Issue #4: ten layout ids produced five distinct pages; five were silently the default.
describe("CV layouts", () => {
  test("every layout id has its own row in the modern template's style table", () => {
    const template = readFileSync(join(ROOT, "templates", "cv", "modern", "template.typ"), "utf-8");
    for (const { id } of CV_LAYOUTS) expect(template, id).toMatch(new RegExp(`^\\s+${id}: \\(accent:`, "m"));
  });

  test("no two layouts render the same first page", async () => {
    const hashes = new Map<string, string>();
    for (const { id } of CV_LAYOUTS) {
      const source = join(dir, `layout-${id}.typ`);
      writeFileSync(source, renderCvTypst({ profile: applicationProfile, draft: draftWithProject(), outDir: dir, layout: id }));
      const out = join(dir, `layout-${id}-{n}.png`);
      await typst(["compile", "--root", ROOT, "--ppi", "30", source, out]);
      const first = readdirSync(dir).filter((f) => f.startsWith(`layout-${id}-`) && f.endsWith(".png")).sort()[0];
      hashes.set(id, createHash("sha256").update(readFileSync(join(dir, first))).digest("hex"));
    }
    const groups = new Map<string, string[]>();
    for (const [id, hash] of hashes) groups.set(hash, [...(groups.get(hash) ?? []), id]);
    expect([...groups.values()].filter((ids) => ids.length > 1)).toEqual([]);
  }, 120_000);
});

// Issue #5: a validated strategy.sectionOrder produced byte-identical sources.
describe("section order", () => {
  test("strategy.sectionOrder decides the rendered order", async () => {
    const forward = draftWithProject();
    forward.strategy.sectionOrder = ["summary", "experience", "projects", "education", "certifications"];
    const reversed = draftWithProject();
    reversed.strategy.sectionOrder = ["certifications", "education", "projects", "experience", "summary"];
    const a = renderCvTypst({ profile: applicationProfile, draft: forward, outDir: dir });
    const b = renderCvTypst({ profile: applicationProfile, draft: reversed, outDir: dir });
    expect(a).not.toBe(b);
    writeFileSync(join(dir, "order-a.typ"), a);
    writeFileSync(join(dir, "order-b.typ"), b);
    expect((await sectionOrder(join(dir, "order-a.typ")))).toEqual(["Profile", "Skills", "Experience", "Projects", "Education", "Certifications"]);
    expect((await sectionOrder(join(dir, "order-b.typ")))).toEqual(["Certifications", "Education", "Projects", "Experience", "Profile", "Skills"]);
  }, 60_000);

  test("a section left out of the order is appended, never dropped", async () => {
    const draft = draftWithProject();
    draft.strategy.sectionOrder = ["summary", "education"];
    writeFileSync(join(dir, "order-partial.typ"), renderCvTypst({ profile: applicationProfile, draft, outDir: dir }));
    expect((await sectionOrder(join(dir, "order-partial.typ")))).toEqual(["Profile", "Skills", "Education", "Experience", "Projects", "Certifications"]);
  }, 60_000);

  test("project-first lifts projects under the summary within the strategy's order", async () => {
    const draft = draftWithProject();
    writeFileSync(join(dir, "project-first.typ"), renderCvTypst({ profile: applicationProfile, draft, outDir: dir, layout: "project-first" }));
    expect((await sectionOrder(join(dir, "project-first.typ"))).slice(0, 4)).toEqual(["Profile", "Skills", "Projects", "Experience"]);
  }, 60_000);
});

describe("interests", () => {
  test("profile interests print as the last section, and can be omitted", async () => {
    const profile = structuredClone(applicationProfile);
    profile.interests = ["Trail running", "Home lab"];
    writeFileSync(join(dir, "interests.typ"), renderCvTypst({ profile, draft: draftWithProject(), outDir: dir }));
    expect((await sectionOrder(join(dir, "interests.typ"))).at(-1)).toBe("Interests");
    const omitted = renderCvTypst({ profile, draft: draftWithProject(), outDir: dir, interests: false });
    expect(omitted).not.toContain("Trail running");
  }, 60_000);
});

describe("education", () => {
  test("a field that repeats the degree is not printed again as a bullet", () => {
    const profile = structuredClone(applicationProfile);
    profile.education = [{ degree: "Cyber and Information Security", field: "Cyber and Information Security", institution: "Example College", endYear: 2022 }];
    const source = renderCvTypst({ profile, draft: validApplicationDraft(), outDir: dir });
    expect(source).toContain('degree: "Cyber and Information Security", institution: "Example College", field: ""');
  });
});

// Pilot review: on Typst 0.10 (the npm `typst` fallback) `sticky` is ignored and a
// section heading ended page 1 with its first entry overleaf. Sweep the amount of
// filler so some heading lands at every position near the page foot.
describe("pagination", () => {
  test.skipIf(!HAS_PDFTOTEXT)("no section heading ends a page, in any layout, whatever the content length", async () => {
    const orphans: string[] = [];
    for (const { id: layout } of CV_LAYOUTS) for (let n = 0; n < 14; n++) {
      const filler = Array.from({ length: n }, (_, i) => `"Filler achievement ${i} describing delivery work in plain words for spacing tests."`).join(", ");
      const source = join(dir, `sweep-${layout}-${n}.typ`);
      writeFileSync(source, `#import "${relative(dir, join(ROOT, "templates", "cv", "modern", "template.typ"))}": cv-body
#show: cv-body(
  name: "Jane", lastname: "Doe", contact: ("jane@example.com",), languages: ("English",),
  headline: "Platform Engineer", profile: "Platform engineer who builds delivery automation with a security focus and keeps operations calm.",
  skills: ((label: "Cloud", value: "Azure, AWS, Kubernetes"), (label: "Automation", value: "Python, Go, Terraform")),
  experience: (
    (date: "2022 - Present", title: "Senior Platform Engineer", company: "Northwind", location: "Remote", content: ("Designed a self-service module catalogue used by product teams.", "Moved CI credentials to short-lived workload identity.", ${filler}${filler ? "," : ""} "Led the incident review practice.")),
    (date: "2019 - 2022", title: "DevOps Engineer", company: "Contoso", location: "Porto", content: ("Migrated services to Kubernetes.", "Built cost-reporting tooling.")),
  ),
  projects: ((title: "drift-watch", url: "", description: "CLI that compares Terraform state with live resources.", highlights: ()),),
  education: ((year: "2018", degree: "BSc", institution: "University of Lisbon", field: "Computer Engineering"),),
  certifications: ((name: "Certified Kubernetes Administrator", date: "2023"),),
  layout: "${layout}",
)
`);
      for (const [i, page] of (await pages(source)).entries()) {
        const last = page.trim().split("\n").map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
        if (HEADINGS.some((h) => h.toLowerCase() === last.toLowerCase())) orphans.push(`${layout} n=${n}: "${last}" ends page ${i + 1}`);
      }
    }
    expect(orphans).toEqual([]);
  }, 300_000);
});

describe("density hint", () => {
  test("names the denser layouts and the market's lower page budget", async () => {
    const { densityHint } = await import("../scripts/reevaluate.js");
    const hint = densityHint([1, 2], 2);
    for (const id of CV_LAYOUTS.filter((o) => o.density === "compact").map((o) => o.id)) expect(hint).toContain(id);
    expect(hint).toContain("1 page(s)");
    expect(densityHint([2, 2], 2)).not.toContain("tighten the draft");
    expect(hint).toContain("never drop a true fact");
  });
});

// Owner E2E run (2026-10-02): a project rendered as one unbreakable block jumped
// to page 2 and left 15-19% of page 1 empty, failing layout:density on 6 of 9
// cells. Sweep the experience length so a project starts at every point near
// the foot of page 1.
describe("page fill before the last page", () => {
  test("no page but the last ends early, whatever the content length", async () => {
    const desc = "Planned a directory migration to Microsoft Entra, built automation to migrate users, configured Conditional Access and Intune compliance, encryption and Platform SSO, configured SSO for the client's SaaS applications, and ran the test end to end.";
    const project = (title: string, n: number) =>
      `(title: "${title}", url: "", description: "${desc}", highlights: (${Array.from({ length: n }, (_, i) => `"Highlight ${i} describing a bounded contribution."`).join(", ")}${n === 1 ? "," : ""}))`;
    const early: string[] = [];
    for (const layout of ["minimal", "technical", "executive"]) for (let n = 0; n < 10; n++) {
      const bullets = Array.from({ length: 5 + n }, (_, i) => `"Bullet ${i}: designed security controls including device policy, Conditional Access rules and data protection configuration."`).join(", ");
      const source = join(dir, `fill-${layout}-${n}.typ`);
      writeFileSync(source, `#import "${relative(dir, join(ROOT, "templates", "cv", "modern", "template.typ"))}": cv-body
#show: cv-body(
  name: "Jane", lastname: "Doe", contact: ("jane@example.com",), languages: ("English",),
  headline: "Cloud Security Engineer", profile: "Engineer working across identity, security controls and workflow automation, migrating directories and removing manual steps from security operations.",
  skills: ((label: "Identity", value: "Entra ID, Conditional Access, Intune"), (label: "Automation", value: "PowerShell, Python")),
  experience: ((date: "2022 - Present", title: "Cloud Security Engineer", company: "Example", location: "Remote", content: (${bullets})),),
  projects: (${project("Directory migration", 2)}, ${project("MFA pilot", 2)}, ${project("Lifecycle automation", 1)}),
  education: ((year: "2022", degree: "Cyber Security", institution: "College", field: ""),),
  certifications: ((name: "MS-900", date: "2022"),),
  layout: "${layout}",
)
`);
      await typst(["compile", "--root", ROOT, source, source.replace(/\.typ$/, ".pdf")]);
      const report = await checkLayout(source.replace(/\.typ$/, ".pdf"), source);
      if (report.unavailable) return;
      for (const page of report.pages.slice(0, -1)) if (page.underfilled) early.push(`${layout} n=${n}: ${page.file} ${page.trailingWhitespaceRatio.toFixed(2)}`);
    }
    expect(early).toEqual([]);
  }, 300_000);
});

// jobsearch-plugin#15: splitting the project block also tightened its spacing,
// so identical content came out shorter and an executive CV that passed
// final-page density in 2.3.0 failed in 2.4.0. Render the same content with the
// 2.3.0 single-block project code and with the current code, and compare where
// the next section starts.
const SINGLE_BLOCK_PROJECTS = `    let projects-section = {
      for (i, project) in projects.enumerate() {
        block(breakable: false, above: if i == 0 { gap-section } else { 1.2em })[
          #if i == 0 { section("Projects") }
          #text(weight: "bold", size: size-entry)[#project.title]
          #if project.url != "" [
            #h(5pt)
            #text(size: size-meta, fill: accent)[#link(project.url)[Project link]]
          ]
          #if project.description != "" [
            #v(2pt)
            #text(size: size-body)[#project.description]
          ]
          #if project.highlights.len() > 0 [
            #v(2pt)
            #for highlight in project.highlights [
              #grid(
                columns: (8pt, 1fr),
                gutter: 2pt,
                text(size: size-body)[#bullet],
                text(size: size-body)[#highlight],
              )
              #v(1pt)
            ]
          ]
        ]
        v(gap-entry)
      }
    }
`;

describe("project spacing", () => {
  test.skipIf(!HAS_PDFTOTEXT)("splitting the project block keeps the 2.3.0 vertical rhythm", async () => {
    const templateDir = join(ROOT, "templates", "cv", "modern");
    const current = readFileSync(join(templateDir, "template.typ"), "utf-8");
    const start = current.indexOf("    let projects-section = {");
    const end = current.indexOf("    let education-section = {");
    expect(start).toBeGreaterThan(0);
    const reference = join(templateDir, `.template-single-block-${process.pid}.typ`);
    writeFileSync(reference, current.slice(0, start) + SINGLE_BLOCK_PROJECTS + "\n" + current.slice(end));
    try {
      const educationTop = async (template: string, layout: string) => {
        const source = join(dir, `rhythm-${layout}-${template.includes("single") ? "ref" : "cur"}.typ`);
        writeFileSync(source, `#import "${relative(dir, template)}": cv-body
#show: cv-body(name: "Jane", lastname: "Doe", contact: ("jane@example.com",), languages: ("English",), headline: "Engineer", profile: "Short profile.",
  skills: ((label: "Identity", value: "Entra ID"),),
  experience: ((date: "2022", title: "Engineer", company: "Example", location: "Remote", content: ("Bullet one.", "Bullet two.")),),
  projects: ${"(" + ["One", "Two", "Three"].map((t) => `(title: "Project ${t}", url: "", description: "Planned a directory migration to Microsoft Entra and configured Conditional Access and Intune compliance for the client.", highlights: ("First bounded contribution.", "Second bounded contribution."))`).join(", ") + ")"},
  education: ((year: "2022", degree: "Cyber", institution: "College", field: ""),), certifications: ((name: "MS-900", date: "2022"),), layout: "${layout}")
`);
        const pdf = source.replace(/\.typ$/, ".pdf");
        await typst(["compile", "--root", ROOT, source, pdf]);
        const bbox = Bun.spawnSync([resolveBin("pdftotext")!, "-bbox", pdf, "-"]).stdout.toString();
        const match = bbox.match(/yMin="([0-9.]+)"[^>]*>Education</i);
        expect(match).not.toBeNull();
        return Number(match![1]);
      };
      for (const { id: layout } of CV_LAYOUTS) {
        const drift = Math.abs((await educationTop(join(templateDir, "template.typ"), layout)) - (await educationTop(reference, layout)));
        // A constant 1pt at the section end remains; the per-project rhythm is identical.
        expect(drift, layout).toBeLessThan(1.5);
      }
    } finally {
      rmSync(reference, { force: true });
    }
  }, 120_000);
});
