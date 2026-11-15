import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CV_LAYOUTS } from "../src/cv-options.js";
import { resolveBin, resolveTypstCommand } from "../src/resolve-bin.js";

const ROOT = resolve(import.meta.dir, "..");
const TYPST_COMMAND = resolveTypstCommand(ROOT);
const WORK_DIR = join(ROOT, ".tmp-modern-airy-test");
const SOURCE = join(WORK_DIR, "modern-airy.typ");
const PDF = join(WORK_DIR, "modern-airy.pdf");

function typstString(value: string): string {
  return `\"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}\"`;
}

function tuple(values: readonly string[]): string {
  return `(\n${values.map((value) => `      ${typstString(value)},`).join("\n")}\n    )`;
}

function fixtureSource(layout: string): string {
  return `#import "/templates/cv/modern/template.typ": cv-body

#show: cv-body(
  name: "Airy",
  lastname: "Candidate",
  contact: ("airy@example.com", "+1 202 555 0199"),
  profile: "AIRY-PROFILE Summary for the modern-airy variant.",
  skills: ((label: "Python", value: "Python, Terraform"),),
  experience: (
    (date: "2023 - Present", title: "Engineer", company: "Air Co", location: "Remote", content: ("AIRY-BULLET-01 Built delivery automation.", "AIRY-BULLET-02 Reviewed access controls.")),
  ),
  projects: (
    (title: "Airy Project", url: "https://example.com/airy", description: "AIRY-PROJECT-DESC A deterministic pipeline.", highlights: ("AIRY-PROJECT-BULLET-01 Compiles source.",)),
  ),
  education: (
    (year: "2022", degree: "BSc Cyber Security", institution: "Example College", field: ""),
  ),
  certifications: (
    (name: "AIRY-CERT Cloud Fundamentals", date: "2023"),
  ),
  layout: "${layout}",
)`;
}

async function runTypst(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
 if (!TYPST_COMMAND) throw new Error("Typst CLI not found");
 const proc = Bun.spawn([...TYPST_COMMAND, ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

describe("modern-airy CV variant", () => {
  test("is a distinct discoverable layout option, not an alias of modern", () => {
    const modernAiry = CV_LAYOUTS.find((option) => option.id === "modern-airy");
    expect(modernAiry).toBeDefined();
    expect(modernAiry?.id).toBe("modern-airy");
    expect(modernAiry?.name).toBe("Modern Airy");
    expect(modernAiry?.supportsAvatar).toBe(true);
    expect(CV_LAYOUTS.filter((o) => o.id === "modern-airy")).toHaveLength(1);
    expect(CV_LAYOUTS.find((o) => o.id === "modern")).toBeDefined();
  });

  test("template registers a modern-airy row with Liberation Sans and the approved metrics", () => {
    const template = readFileSync(join(ROOT, "templates", "cv", "modern", "template.typ"), "utf8");
    expect(template).toMatch(/^\s+modern-airy: \(/m);
    expect(template).toContain('"Liberation Sans"');
    expect(template).toContain("name-size: 26pt");
    expect(template).toContain("section-size: 11.5pt");
    expect(template).toContain("entry-size: 10.5pt");
    expect(template).toContain("body-size: 10.3pt");
    expect(template).toContain("meta-size: 9.5pt");
    expect(template).toContain("leading: 0.45em");
    expect(template).toContain("gap-section: 10pt");
    expect(template).toContain("gap-entry: 8pt");
    expect(template).toContain("margin-x: 15mm");
    expect(template).toContain("margin-y: 12.5mm");
  });

  test("modern-airy metrics differ from the modern layout (not an alias)", () => {
    const template = readFileSync(join(ROOT, "templates", "cv", "modern", "template.typ"), "utf8");
    const modernRow = template.match(/^\s+modern: \([\s\S]*?\)\n/m)?.[0] ?? "";
    const airyRow = template.match(/^\s+modern-airy: \([\s\S]*?\)\n/m)?.[0] ?? "";
    expect(modernRow).not.toEqual(airyRow);
    // modern uses shared size-name (28pt); modern-airy names its own 26pt.
    expect(airyRow).toContain("name-size: 26pt");
  });

  test("compiles a modern-airy CV and preserves all supplied content", async () => {
    if (!TYPST_COMMAND) throw new Error("Typst CLI not found");
    rmSync(WORK_DIR, { recursive: true, force: true });
    mkdirSync(WORK_DIR, { recursive: true });
    writeFileSync(SOURCE, fixtureSource("modern-airy"));
    const result = await runTypst(["compile", "--root", ROOT, SOURCE, PDF]);
    expect(result.code, result.stderr).toBe(0);
    expect(existsSync(PDF)).toBe(true);

    const text = Bun.spawnSync([resolveBin("pdftotext")!, "-layout", PDF, "-"]).stdout.toString();
    expect(text).toContain("Airy Candidate");
    expect(text).toContain("AIRY-PROFILE Summary for the modern-airy variant.");
    expect(text).toContain("AIRY-BULLET-01 Built delivery automation.");
    expect(text).toContain("AIRY-BULLET-02 Reviewed access controls.");
    expect(text).toContain("AIRY-PROJECT-DESC A deterministic pipeline.");
    expect(text).toContain("AIRY-PROJECT-BULLET-01 Compiles source.");
    expect(text).toContain("BSc Cyber Security");
    expect(text).toContain("Example College");
    expect(text).toContain("AIRY-CERT Cloud Fundamentals");
    expect(text).toContain("Engineer");
    expect(text).toContain("Air Co");
    expect(text).toContain("Airy Project");
    // Inspect actual compiled font sizes, not just unused token declarations.
    const xml = Bun.spawnSync([resolveBin("pdftohtml")!, "-zoom", "1", "-xml", "-stdout", PDF]).stdout.toString();
    const contactFont = xml.match(/<text[^>]*font="([^"]+)"[^>]*>airy@example\.com/)!;
    expect(contactFont).not.toBeNull();
    const contactSize = xml.match(new RegExp(`<fontspec id="${contactFont[1]}" size="(\\d+)"`));
    expect(Number(contactSize?.[1])).toBe(10); // Poppler rounds 9.5pt to 10, unlike the old 9pt.
  });

  afterAll(() => {
    if (process.env.KEEP_MODERN_AIRY_TEST_OUTPUT !== "1") {
      rmSync(WORK_DIR, { recursive: true, force: true });
    }
  });
});
