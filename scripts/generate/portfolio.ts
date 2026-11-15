#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Profile } from "../../src/profile-schemas.js";
import { TEMPLATES, DEFAULT_TEMPLATE, getTemplate, listTemplates, type Repo, type PortfolioData } from "../../src/portfolio-templates.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";
import { exportPortfolioPdf, portfolioRequiredText, type PortfolioPdfReceipt } from "../../src/portfolio-pdf.js";

const DEFAULT_PROFILE = join(ROOT, "data", "profile.json");
const GITHUB_STAGING = join(ROOT, "data", "staging", "github.json");
const DEFAULT_OUT = join(ROOT, "assets", "portfolio", "index.html");

const HELP = `Portfolio Page Generator — profile.json → self-contained static HTML.

Usage:
  portfolio.ts [--template <name>] [--format html|pdf] [--out <path>] [--profile <path>] [--max-repos N]
  portfolio.ts --list-templates

Templates:
${listTemplates().map((t) => `  ${t.name.padEnd(12)} ${t.description}`).join("\n")}

Sections: identity + links, approved client-work projects, approved personal
projects, skills by category, experience, education, and GitHub repositories.
The default showcase template is the project warehouse. Sections with no data
render an honest placeholder instead of invented content.

PDF needs Chromium/Chrome and Poppler. It verifies required content and preserves
the last good PDF on failure; every final page still needs visual inspection.
Output: JSON { file, format, template, sections: { populated, placeholders }, pdf? }. Exit 0/1.`;

export async function main(): Promise<number> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      template: { type: "string", short: "t" },
      out: { type: "string" },
      profile: { type: "string" },
      format: { type: "string" },
      "max-repos": { type: "string" },
      "list-templates": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  if (values["list-templates"]) {
    const tmpl = listTemplates();
    process.stdout.write(JSON.stringify({ templates: tmpl, default: DEFAULT_TEMPLATE }, null, 2) + "\n");
    return 0;
  }

  const format = values.format ?? "html";
  if (format !== "html" && format !== "pdf") {
    process.stderr.write(JSON.stringify({ error: "format must be html or pdf", code: "BAD_FORMAT" }) + "\n");
    return 1;
  }
  const templateName = typeof values.template === "string" ? values.template : DEFAULT_TEMPLATE;
  const template = getTemplate(templateName);
  if (!TEMPLATES[templateName]) {
    process.stderr.write(`Warning: unknown template "${templateName}" — falling back to "${DEFAULT_TEMPLATE}"\n`);
  }

  const profilePath = typeof values.profile === "string" ? resolve(process.cwd(), values.profile) : DEFAULT_PROFILE;
  if (!existsSync(profilePath)) {
    process.stderr.write(JSON.stringify({ error: `profile not found: ${profilePath}. Run: bun run profile`, code: "NO_PROFILE" }) + "\n");
    return 1;
  }
  let profile: Profile;
  try {
    profile = Profile.parse(JSON.parse(readFileSync(profilePath, "utf-8")));
  } catch (e) {
    process.stderr.write(JSON.stringify({ error: `profile failed validation: ${e}`, code: "BAD_PROFILE" }) + "\n");
    return 1;
  }

  let repos: Repo[] = [];
  if (existsSync(GITHUB_STAGING)) {
    try {
      const staged = JSON.parse(readFileSync(GITHUB_STAGING, "utf-8")) as { repos?: Repo[] };
      repos = staged.repos ?? [];
    } catch {
      process.stderr.write(JSON.stringify({ warning: "github staging unreadable — repos section will be a placeholder" }) + "\n");
    }
  }

  const maxRepos = Math.max(1, parseInt((values["max-repos"] as string) ?? "12", 10) || 12);
  const portfolioData: PortfolioData = { profile: { ...profile, projects: profile.projects?.filter(project => project.disclosure !== "restricted" && project.disclosure !== "unreviewed") }, repos, maxRepos };
  const { html, populated, placeholders } = template.render(portfolioData);

  const outPath = typeof values.out === "string" ? resolve(process.cwd(), values.out) : format === "pdf" ? join(ROOT, "assets", "portfolio", "portfolio.pdf") : DEFAULT_OUT;
  const inputStat = statSync(profilePath), outputStat = existsSync(outPath) ? statSync(outPath) : undefined;
  if (outPath === profilePath || (outputStat?.dev === inputStat.dev && outputStat?.ino === inputStat.ino)) {
    process.stderr.write(JSON.stringify({ error: "Portfolio output must not replace the source profile", code: "INPUT_OUTPUT_CONFLICT" }) + "\n");
    return 1;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  let pdf: PortfolioPdfReceipt | undefined;
  try {
    if (format === "pdf") pdf = exportPortfolioPdf(html, outPath, portfolioRequiredText(profile));
    else writeFileSync(outPath, html);
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error), code: "PDF_EXPORT_FAILED" }) + "\n");
    return 1;
  }

  process.stdout.write(
    JSON.stringify({ file: outPath.replace(ROOT + "/", ""), format, template: template.name, sections: { populated, placeholders }, ...(pdf ? { pdf } : {}) }, null, 2) + "\n"
  );
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
