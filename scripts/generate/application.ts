#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ApplicationDraft, buildApplicationBrief, reviewApplicationDraft } from "../../src/application-draft.js";
import { renderCoverLetterTypst, renderCvTypst } from "../../src/application-renderers.js";
import { Profile } from "../../src/profile-schemas.js";
import { CV_LAYOUTS } from "../../src/cv-options.js";
import { buildSourcePath, loadConfig, profileDocumentName } from "../../src/naming.js";
import { readStdin } from "../../src/stdin.js";
import { z } from "zod";
import { CODE_ROOT, WORKSPACE as ROOT } from "../../src/paths.js";

const DEFAULT_PROFILE = join(ROOT, "data", "profile.json");

const HELP = `application — evidence-grounded CV + cover-letter drafting pipeline

USAGE
  bun run application prepare --company <name> --role <title> --job <file|-> [options]
  bun run application review  --draft <file|-> --job <file> [options]
  bun run application render  --draft <file|-> --job <file> [options]

COMMANDS
  prepare  Emit a provider-neutral LLM prompt bundle as JSON; writes nothing
  review   Validate schema, evidence references, unsupported numbers, gaps, and style
  render   Review, then write convention-named Typst CV + cover letter

OPTIONS
  --company <name>       Required for prepare; inferred from draft otherwise
  --role <title>         Required for prepare; inferred from draft otherwise
  --job <file|->         Raw posting; '-' reads stdin
  --draft <file|->       ApplicationDraft JSON; '-' reads stdin
  --profile <file>       Profile JSON (default: data/profile.json)
  --language <name>      Cover-letter language (default: the market's own)
  --market <code>        Force a market (de, dk, ch, ie...); detected from the posting otherwise
  --cv-template <name>   Typst CV template (default: modern)
  --layout <name>            Chosen CV layout variant (required for render)
  --cl-template <name>   Typst cover template (default: modern)
  --date <YYYY-MM-DD>    Grouped output date (default: today)
  --compile              Compile both Typst sources after rendering
  --force                Overwrite existing convention-named source files
  -h, --help             Show help

OUTPUT
  One JSON document to stdout. Diagnostics are JSON on stderr. Exit 0/1.

LLM FLOW
  1. Save prepare's .prompt text and send it to the LLM of your choice.
  2. Save the strict JSON response as draft.json.
  3. Run review until pass=true, then render --compile and bun run reevaluate.
`;

interface CliOptions {
  company?: string;
  role?: string;
  job?: string;
  draft?: string;
  profile?: string;
  language?: string;
  market?: string;
  cvTemplate: string;
  clTemplate: string;
  layout?: string;
  date?: string;
  compile: boolean;
  force: boolean;
}

interface ParsedValues {
  company?: string;
  role?: string;
  job?: string;
  draft?: string;
  profile?: string;
  language?: string;
  market?: string;
  "cv-template": string;
  "cl-template": string;
  layout?: string;
  date?: string;
  compile: boolean;
  force: boolean;
  help: boolean;
}

function error(message: string, code: string, details?: unknown): number {
  process.stderr.write(JSON.stringify({ error: message, code, ...(details === undefined ? {} : { details }) }) + "\n");
  return 1;
}

function loadProfile(path: string): Profile {
  return Profile.parse(JSON.parse(readFileSync(path, "utf-8")));
}

async function readInput(path: string, label: string): Promise<string> {
  if (path === "-") return readStdin();
  const absolute = resolve(process.cwd(), path);
  if (!existsSync(absolute)) throw new Error(`${label} not found: ${absolute}`);
  return readFileSync(absolute, "utf-8");
}

function assertTemplate(kind: "cv" | "cover", name: string): void {
  const path = join(CODE_ROOT, "templates", kind, name, "template.typ");
  if (!existsSync(path)) throw new Error(`${kind} template '${name}' is unavailable or a stub`);
}

async function prepare(options: CliOptions, profile: Profile): Promise<number> {
  if (!options.company || !options.role || !options.job) return error("prepare requires --company, --role, and --job", "BAD_ARGS");
  const posting = await readInput(options.job, "job posting");
  if (!posting.trim()) return error("job posting is empty", "EMPTY_JOB");
  const brief = buildApplicationBrief({
    profile,
    posting,
    company: options.company,
    role: options.role,
    language: options.language,
    market: options.market,
  });
  process.stdout.write(JSON.stringify(brief, null, 2) + "\n");
  return 0;
}

async function loadDraftAndBrief(options: CliOptions, profile: Profile): Promise<{
  draft: ApplicationDraft;
  brief: ReturnType<typeof buildApplicationBrief>;
}> {
  if (!options.draft || !options.job) throw new Error("review/render require --draft and --job");
  if (options.draft === "-" && options.job === "-") throw new Error("--draft and --job cannot both read stdin");
  const draft = ApplicationDraft.parse(JSON.parse(await readInput(options.draft, "draft")));
  const posting = await readInput(options.job, "job posting");
  const brief = buildApplicationBrief({
    profile,
    posting,
    company: options.company ?? draft.company,
    role: options.role ?? draft.role,
    language: options.language ?? draft.language,
    market: options.market,
  });
  return { draft, brief };
}

async function review(options: CliOptions, profile: Profile): Promise<number> {
  const { draft, brief } = await loadDraftAndBrief(options, profile);
  const result = reviewApplicationDraft(draft, brief);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result.pass ? 0 : 1;
}

async function render(options: CliOptions, profile: Profile): Promise<number> {
  const { draft, brief } = await loadDraftAndBrief(options, profile);
  const reviewResult = reviewApplicationDraft(draft, brief);
  if (!reviewResult.pass) {
    process.stdout.write(JSON.stringify({ written: false, review: reviewResult }, null, 2) + "\n");
    return 1;
  }
  const blockingMissingFacts = brief.missingFacts.filter((fact) => ["candidate name", "email", "experience"].includes(fact));
  if (blockingMissingFacts.length > 0) return error("profile is incomplete for document rendering", "MISSING_PROFILE_FACTS", blockingMissingFacts);

  assertTemplate("cv", options.cvTemplate);
  assertTemplate("cover", options.clTemplate);
  const namingConfig = { ...loadConfig(), name: profileDocumentName(profile.identity) };
  const cvRelative = buildSourcePath("cv", draft.company, draft.role, namingConfig, options.date);
  const clRelative = buildSourcePath("cl", draft.company, draft.role, namingConfig, options.date);
  const cvPath = join(ROOT, cvRelative);
  const clPath = join(ROOT, clRelative);
  if (!options.force && (existsSync(cvPath) || existsSync(clPath))) {
    return error("output exists; pass --force to overwrite the exact convention-named files", "OUTPUT_EXISTS", {
      cv: cvRelative,
      coverLetter: clRelative,
    });
  }

  mkdirSync(dirname(cvPath), { recursive: true });
  if (!options.layout) {
    return error("choose a CV layout after reviewing the agent's shortlist", "LAYOUT_CHOICE_REQUIRED", {
      recommended: brief.layoutRecommendation.recommended,
      options: brief.layoutRecommendation.options,
    });
  }
  const layout = options.layout;
  const layoutOption = CV_LAYOUTS.find((option) => option.id === layout);
  if (!layoutOption) return error(`unknown CV layout: ${layout}`, "BAD_LAYOUT", { available: CV_LAYOUTS.map((option) => option.id) });
  const photoPath = join(ROOT, "assets", "photos", "profile.jpg");
  // Avatar use follows the selected template's designed slot. A template that
  // has no avatar slot never receives an image; a template that has one uses
  // the approved photo when the user has provided it.
  const photo = options.cvTemplate === "modern" && layoutOption.supportsAvatar && existsSync(photoPath) ? photoPath : undefined;
  writeFileSync(
    cvPath,
    renderCvTypst({ profile, draft, outDir: dirname(cvPath), template: options.cvTemplate, market: brief.market, photo, layout, supportsAvatar: layoutOption.supportsAvatar }),
  );
  writeFileSync(
    clPath,
    renderCoverLetterTypst({ profile, draft, outDir: dirname(clPath), template: options.clTemplate, date: options.date }),
  );

  const compiled: Array<{ type: "cv" | "cl"; status: string; pages: number | null; error?: string }> = [];
  if (options.compile) {
    const { compile } = await import("../build/cli.js");
    for (const [type, path] of [["cv", cvPath], ["cl", clPath]] as const) {
      const result = await compile(path);
      compiled.push({ type, status: result.status, pages: result.pages, ...(result.error ? { error: result.error } : {}) });
    }
    if (compiled.some((result) => result.status !== "success")) {
      process.stdout.write(JSON.stringify({ written: true, files: { cv: cvRelative, coverLetter: clRelative }, compiled, review: reviewResult }, null, 2) + "\n");
      return 1;
    }
  }

  process.stdout.write(
    JSON.stringify(
      { written: true, files: { cv: cvRelative, coverLetter: clRelative }, compiled, review: reviewResult, next: `bun run reevaluate --company ${JSON.stringify(draft.company)} --role ${JSON.stringify(draft.role)} --market ${brief.market}` },
      null,
      2,
    ) + "\n",
  );
  return 0;
}

export async function main(argv = Bun.argv.slice(2)): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        company: { type: "string" },
        role: { type: "string" },
        job: { type: "string" },
        draft: { type: "string" },
        profile: { type: "string" },
        language: { type: "string" },
        market: { type: "string" },
        "cv-template": { type: "string", default: "modern" },
        "cl-template": { type: "string", default: "modern" },
        layout: { type: "string" },
        date: { type: "string" },
        compile: { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : String(cause), "BAD_ARGS");
  }

  const values = parsed.values as unknown as ParsedValues;
  const command = parsed.positionals[0];
  if (values.help || command === "help" || !command) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!/^(prepare|review|render)$/.test(command)) return error(`unknown command: ${command}`, "BAD_COMMAND");
  if (parsed.positionals.length > 1) return error(`unexpected positional arguments: ${parsed.positionals.slice(1).join(" ")}`, "BAD_ARGS");
  if (values.date && !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) return error("--date must be YYYY-MM-DD", "BAD_DATE");

  const profilePath = resolve(process.cwd(), values.profile ?? DEFAULT_PROFILE);
  if (!existsSync(profilePath)) return error(`profile not found: ${profilePath}. Run: bun run profile`, "NO_PROFILE");
  let profile: Profile;
  try {
    profile = loadProfile(profilePath);
  } catch (cause) {
    return error("profile failed validation", "BAD_PROFILE", cause instanceof Error ? cause.message : String(cause));
  }

  const options: CliOptions = {
    company: values.company,
    role: values.role,
    job: values.job,
    draft: values.draft,
    profile: values.profile,
    language: values.language,
    market: typeof values.market === "string" ? values.market : undefined,
    cvTemplate: values["cv-template"],
    clTemplate: values["cl-template"],
    layout: values.layout,
    date: values.date,
    compile: values.compile,
    force: values.force,
  };

  try {
    if (command === "prepare") return await prepare(options, profile);
    if (command === "review") return await review(options, profile);
    return await render(options, profile);
  } catch (cause) {
    if (cause instanceof SyntaxError) return error(`invalid JSON: ${cause.message}`, "BAD_JSON");
    if (cause instanceof z.ZodError) return error("input failed schema validation", "BAD_SCHEMA", cause.issues);
    return error(cause instanceof Error ? cause.message : String(cause), "FAILED");
  }
}

if (import.meta.main) process.exit(await main());
