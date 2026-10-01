import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderCoverLetterTypst, renderCvTypst } from "../src/application-renderers.js";
import { getPageCount } from "../scripts/verify-ats.js";
import { resolveTypstCommand } from "../src/resolve-bin.js";
import { applicationProfile, validApplicationDraft } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");
const TYPST_COMMAND = resolveTypstCommand(ROOT);
const WORK_DIR = join(ROOT, ".tmp-application-rendering-test");
const CV_SOURCE = join(WORK_DIR, "Alex_Acme_Platform-Engineer_CV.typ");
const CL_SOURCE = join(WORK_DIR, "Alex_Acme_Platform-Engineer_CL.typ");
const CV_PDF = CV_SOURCE.replace(/\.typ$/, ".pdf");
const CL_PDF = CL_SOURCE.replace(/\.typ$/, ".pdf");

function typstCommand(): string[] {
  if (!TYPST_COMMAND) throw new Error("Typst CLI not found; install dependencies or Typst");
  return TYPST_COMMAND;
}

async function typst(args: string[]) {
  const proc = Bun.spawn([...typstCommand(), ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

describe("application renderer compilation", () => {
  beforeAll(() => {
    rmSync(WORK_DIR, { recursive: true, force: true });
    mkdirSync(WORK_DIR, { recursive: true });
    const draft = validApplicationDraft();
    writeFileSync(CV_SOURCE, renderCvTypst({ profile: applicationProfile, draft, outDir: WORK_DIR, template: "modern" }));
    writeFileSync(CL_SOURCE, renderCoverLetterTypst({ profile: applicationProfile, draft, outDir: WORK_DIR, template: "modern", date: "2026-07-18" }));
  });

  afterAll(() => {
    if (process.env.KEEP_APPLICATION_RENDER_OUTPUT !== "1") rmSync(WORK_DIR, { recursive: true, force: true });
  });

  test("compiles the rendered CV and cover letter with nonblank PDFs", async () => {
    for (const [source, pdf] of [[CV_SOURCE, CV_PDF], [CL_SOURCE, CL_PDF]] as const) {
      const result = await typst(["compile", "--root", ROOT, source, pdf]);
      expect(result.code, result.stderr).toBe(0);
      expect(existsSync(pdf)).toBe(true);
      expect(statSync(pdf).size).toBeGreaterThan(10_000);
    }
    expect(getPageCount(CL_PDF)).toBe(1);
  });

  test("preserves profile text, contact links, languages, and bullets in the compiled CV structure", async () => {
    const profile = await typst(["query", "--root", ROOT, CV_SOURCE, "<cv-profile>", "--field", "value"]);
    const languages = await typst(["query", "--root", ROOT, CV_SOURCE, "<cv-languages>", "--field", "value"]);
    const bullets = await typst(["query", "--root", ROOT, CV_SOURCE, "<cv-entry-item>", "--field", "value"]);
    expect(profile.code, profile.stderr).toBe(0);
    expect(languages.code, languages.stderr).toBe(0);
    expect(bullets.code, bullets.stderr).toBe(0);
    expect(JSON.parse(languages.stdout)).toEqual(["English"]);
    expect(JSON.parse(profile.stdout)[0]).toContain("Platform engineer who builds");
    const renderedBullets = JSON.parse(bullets.stdout);
    expect(renderedBullets.slice(0, 2)).toEqual([
      "Automated cloud environment delivery with Python and Terraform.",
      "Maintained deployment tooling with the security team.",
    ]);
    expect(JSON.stringify(renderedBullets[2])).toContain("Computer Science");
    expect(readFileSync(CV_SOURCE, "utf8")).toContain("link(\"https://portfolio.example.com\")[Website]");
    expect(readFileSync(CV_SOURCE, "utf8")).toContain("link(\"https://linkedin.com/in/alex\")[LinkedIn]");
    expect(readFileSync(CV_SOURCE, "utf8")).not.toContain("profile:experience");
  });
});
