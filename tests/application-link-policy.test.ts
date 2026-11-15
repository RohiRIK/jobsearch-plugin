import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveTypstCommand } from "../src/resolve-bin.js";
import { applicationPosting, applicationProfile, validApplicationDraft } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");
const TYPST = resolveTypstCommand(ROOT);

interface RunResult { code: number; stdout: string; stderr: string }

async function run(args: string[], env: Record<string, string | undefined>): Promise<RunResult> {
  const proc = Bun.spawn([process.execPath, "run", join(ROOT, "scripts/generate/application.ts"), ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: ROOT,
    env: { ...process.env, ...env },
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

interface ScannedFiles { cv: string | null; cl: string | null }

function findSources(dir: string): ScannedFiles {
  const files = readdirSync(dir, { recursive: true, withFileTypes: false }) as string[];
  const typFiles = files.map(String).filter((f) => f.endsWith(".typ"));
  const cv = typFiles.find((f) => f.endsWith("_CV.typ")) ?? null;
  const cl = typFiles.find((f) => f.endsWith("_CL.typ")) ?? null;
  return {
    cv: cv ? join(dir, cv) : null,
    cl: cl ? join(dir, cl) : null,
  };
}

/** Draft extended with the profile's portfolio project so project links have evidence. */
function draftWithProject(): unknown {
  const draft = validApplicationDraft();
  return {
    ...draft,
    cv: {
      ...draft.cv,
      projects: [
        {
          slug: "delivery-pipeline",
          description: {
            text: "Delivery pipeline for platform teams built with Python and Terraform.",
            evidenceIds: ["profile:project:delivery-pipeline"],
          },
          highlights: [
            {
              text: "Reusable deployment pipeline for platform teams.",
              evidenceIds: ["profile:project:delivery-pipeline"],
            },
          ],
        },
      ],
    },
  };
}

describe("application link policy", () => {
  let dir: string;
  let profilePath: string;
  let postingPath: string;
  let draftPath: string;
  let profileHash: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "application-link-policy-"));
    profilePath = join(dir, "profile.json");
    postingPath = join(dir, "job.txt");
    draftPath = join(dir, "draft.json");
    writeFileSync(profilePath, JSON.stringify(applicationProfile));
    profileHash = sha256(profilePath);
    writeFileSync(postingPath, applicationPosting);
    writeFileSync(draftPath, JSON.stringify(draftWithProject()));
  });

  afterAll(() => {
    if (process.env.KEEP_APPLICATION_LINK_OUTPUT !== "1") rmSync(dir, { recursive: true, force: true });
  });

  function envFor(home: string): Record<string, string> {
    return { JOB_SEARCH_HOME: home, JOB_SEARCH_PLUGIN_ROOT: ROOT };
  }

  test("default render keeps the project URL and all profile links (backward compatible)", async () => {
    const home = join(dir, "home-default");
    const result = await run(
      ["render", "--draft", draftPath, "--job", postingPath, "--profile", profilePath, "--layout", "modern"],
      envFor(home),
    );
    expect(result.code, result.stderr).toBe(0);
    const { cv, cl } = findSources(join(home, "assets"));
    expect(cv).not.toBeNull();
    expect(cl).not.toBeNull();
    const cvSource = readFileSync(cv!, "utf-8");
    expect(cvSource).toContain("https://example.com/delivery-pipeline");
    const clSource = readFileSync(cl!, "utf-8");
    expect(clSource).toContain("https://portfolio.example.com"); // website present by default
  });

  test("--project-links off suppresses the project URL in the generated Typst", async () => {
    const home = join(dir, "home-project-off");
    const result = await run(
      ["render", "--draft", draftPath, "--job", postingPath, "--profile", profilePath, "--layout", "modern", "--project-links", "off"],
      envFor(home),
    );
    expect(result.code, result.stderr).toBe(0);
    const { cv } = findSources(join(home, "assets"));
    expect(cv).not.toBeNull();
    const cvSource = readFileSync(cv!, "utf-8");
    expect(cvSource).not.toContain("https://example.com/delivery-pipeline");
    // The project title and description survive; only the link is suppressed.
    expect(cvSource).toContain("Delivery Pipeline");
    // Explicit on is equivalent to the default.
    const onHome = join(dir, "home-project-on");
    const onResult = await run(
      ["render", "--draft", draftPath, "--job", postingPath, "--profile", profilePath, "--layout", "modern", "--project-links", "on"],
      envFor(onHome),
    );
    expect(onResult.code, onResult.stderr).toBe(0);
    const { cv: onCv } = findSources(join(onHome, "assets"));
    expect(readFileSync(onCv!, "utf-8")).toContain("https://example.com/delivery-pipeline");
  });

  test("--project-links rejects an unknown value", async () => {
    const home = join(dir, "home-project-bad");
    const result = await run(
      ["render", "--draft", draftPath, "--job", postingPath, "--profile", profilePath, "--layout", "modern", "--project-links", "maybe"],
      envFor(home),
    );
    expect(result.code).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("BAD_ARGS");
  });

  test("cover letter honors --links so a LinkedIn-only CV gets no website header", async () => {
    const home = join(dir, "home-links");
    const result = await run(
      ["render", "--draft", draftPath, "--job", postingPath, "--profile", profilePath, "--layout", "modern", "--links", "linkedin"],
      envFor(home),
    );
    expect(result.code, result.stderr).toBe(0);
    const { cl } = findSources(join(home, "assets"));
    expect(cl).not.toBeNull();
    const clSource = readFileSync(cl!, "utf-8");
    expect(clSource).toContain("linkedin: \"https://linkedin.com/in/alex\"");
    expect(clSource).toContain("website: \"\"");
    // The CV honors the same list.
    const { cv } = findSources(join(home, "assets"));
    const cvSource = readFileSync(cv!, "utf-8");
    expect(cvSource).toContain("https://linkedin.com/in/alex");
    expect(cvSource).not.toContain("https://portfolio.example.com");
  });

  test("rendering never mutates the original profile", async () => {
    expect(sha256(profilePath)).toBe(profileHash);
  });

  test("compiled suppressed PDF carries no project URI annotation when Typst is available", async () => {
    if (!TYPST) {
      console.log("Typst unavailable; skipping PDF URI annotation check");
      return;
    }
    const home = join(dir, "home-pdf");
    const result = await run(
      ["render", "--draft", draftPath, "--job", postingPath, "--profile", profilePath, "--layout", "modern", "--project-links", "off", "--compile"],
      envFor(home),
    );
    expect(result.code, result.stderr).toBe(0);
    const { cv } = findSources(join(home, "assets"));
    expect(cv).not.toBeNull();
    const pdfPath = cv!.replace(/\.typ$/, ".pdf");
    expect(existsSync(pdfPath)).toBe(true);
    const pdf = readFileSync(pdfPath);
    const asText = pdf.toString("latin1");
    // A PDF URI annotation embeds the literal URL in the file. With project links
    // suppressed, the portfolio project URL must not appear anywhere in the PDF.
    expect(asText).not.toContain("example.com/delivery-pipeline");
  });
});