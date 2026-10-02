#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { applicationDir, buildOutputPath, buildSourcePath, loadConfig, parseFileName, type DocConfig } from "../src/naming.js";
import { checkAtsQuality, extractText, getPageCount } from "./verify-ats.js";
import { compile } from "./build/cli.js";
import { checkLayout } from "./verify-layout.js";
import { getMarketProfile } from "../src/market-profiles.js";
import { documentNameSlug, profileDocumentName } from "../src/naming.js";
import { Profile } from "../src/profile-schemas.js";
import { WORKSPACE as ROOT } from "../src/paths.js";
import { CV_LAYOUTS } from "../src/cv-options.js";

const PAGE_EXPECTATIONS = { cv: [1, 2] as const, cl: [1, 1] as const };

const HELP = `Document Reevaluation Gate — a generated CV/cover letter must pass every gate before it ships.

Usage:
  reevaluate.ts --company <name> --role <title> [--type cv|cl|both]
  reevaluate.ts --file <path.pdf|path.typ> [--market de] [--profile data/profile.json]
  reevaluate.ts --file <path.pdf> --allow-missing-ats   # local degraded check only

Gates (in order):
  compile   recompiles source on every gate run so imported template changes cannot leave a stale PDF
  pages     CV = 1-2 pages by default (or the selected market's range), cover letter = exactly 1
  layout    rasterized final pages contain no visible ink inside the physical edge safety band
  ats       text layer extracts cleanly, email (and phone for CVs) present as literal text
            (fails closed when pdftotext is missing; --allow-missing-ats enables explicit degraded mode)
  naming    file follows <Name>_<Company>_<Role>_<CV|CL> — no spaces

Output: JSON { documents: [{ file, docType, gates, pass }], pass }.
Exit 0 only when every gate on every document passes — iterate until green.`;

/**
 * An underfilled last CV page is usually a few lines spilling over. Name the
 * concrete moves, densest first, and the one thing never to do (issue #7).
 */
export function densityHint(expected: readonly [number, number], pages: number | null): string {
  const denser = CV_LAYOUTS.filter((option) => option.density === "compact").map((option) => option.id);
  const fewer = pages !== null && pages > expected[0] ? `; or tighten the draft to ${expected[0]} page(s), which this market allows` : "";
  return `the last page is mostly empty: re-render with a denser layout (${denser.join(", ")}) via \`jobsearch render … --layout <id> --force\`${fewer}; or add verified evidence the profile already holds. Never pad, and never drop a true fact just to pass`;
}

/**
 * A missing tool is fixed by installing it, never by editing the document. Before
 * this, a missing Typst produced "fix the source errors" and "shorten or wrap the
 * affected field", which sent agents rewriting a document that was fine.
 */
export function installHint(tool: string): string {
  const how: Record<string, string> = {
    typst: "install Typst (https://github.com/typst/typst#installation, e.g. `cargo install typst-cli` or your package manager)",
    "@napi-rs/canvas": "run `bun install` in a checkout, or install @napi-rs/canvas next to the plugin",
    lualatex: "install a TeX distribution with lualatex (TeX Live or MiKTeX)",
    xelatex: "install a TeX distribution with xelatex (TeX Live or MiKTeX)",
  };
  return `${how[tool] ?? `install ${tool}`} and make sure it is on PATH (\`jobsearch status\` shows what is found), then rerun — the document itself needs no change`;
}

export interface Gate {
  gate: string;
  pass: boolean | null;
  detail: string;
  hint?: string;
}

export interface DocReport {
  file: string;
  docType: "cv" | "cl";
  gates: Gate[];
  pass: boolean;
}

export async function reevaluateDoc(
  sourceOrPdf: string,
  docType: "cv" | "cl",
  options: { allowMissingAts?: boolean; market?: string; profileName?: string } = {},
): Promise<DocReport> {
  const gates: Gate[] = [];
  const abs = resolve(ROOT, sourceOrPdf);
  const isPdf = extname(abs) === ".pdf";
  const sourceCandidates = isPdf ? [abs.replace(/\.pdf$/, ".typ"), abs.replace(/\.pdf$/, ".tex")] : [abs];
  const sourcePath = sourceCandidates.find((p) => existsSync(p)) ?? sourceCandidates[0];
  const pdfPath = isPdf ? abs : abs.replace(/\.(typ|tex)$/, ".pdf");

  if (!existsSync(sourcePath) && !existsSync(pdfPath)) {
    return {
      file: sourceOrPdf,
      docType,
      gates: [{ gate: "exists", pass: false, detail: `neither ${basename(sourcePath)} nor ${basename(pdfPath)} found`, hint: "generate the document first (bun run cover-letter / your CV workflow)" }],
      pass: false,
    };
  }

  if (existsSync(sourcePath)) {
    // Always compile at the shipping gate. A source file can be older than its
    // PDF while one of its imported Typst templates changed, so mtime-only
    // freshness can validate a stale, visually different document.
    const result = await compile(sourcePath);
    gates.push({
      gate: "compile",
      pass: result.status === "success",
      detail: result.status === "success" ? `compiled ${basename(pdfPath)} from current source and template imports` : (result.error ?? "compile failed"),
      hint: result.status === "success" ? undefined : result.missingTool ? installHint(result.missingTool) : "fix the source errors above and rerun",
    });
  } else {
    gates.push({ gate: "compile", pass: null, detail: "no source file — verifying the PDF as-is" });
  }

  const marketProfile = options.market ? getMarketProfile(options.market) : undefined;
  // Market page budgets describe CVs. Applying Germany's two-page CV budget to
  // the cover letter contradicted the cover-letter gate and every template's
  // one-page requirement.
  const expected: readonly [number, number] = docType === "cv"
    ? marketProfile?.pages ?? PAGE_EXPECTATIONS.cv
    : PAGE_EXPECTATIONS.cl;
  const pages = getPageCount(pdfPath);
  const pagePass = pages !== null && pages >= expected[0] && pages <= expected[1];
  gates.push({
    gate: "pages",
    pass: pagePass,
    detail: `expected ${expected[0] === expected[1] ? `exactly ${expected[0]}` : `${expected[0]}-${expected[1]}`} page(s)${marketProfile ? ` for ${marketProfile.name}` : ""}, got ${pages ?? "unreadable"}`,
    hint: pagePass
      ? undefined
      : docType === "cv"
        ? "adjust content to the selected market's page budget; watch for orphaned section titles at page breaks"
        : "cover letter must fit one page including the signature block — shorten paragraphs",
  });

  const layout = await checkLayout(pdfPath, existsSync(sourcePath) ? sourcePath : undefined);
  const overflowPages = layout.pages.filter((page) => page.overflowPixels > 0);
  const collisionPages = layout.pages.filter((page) => page.ruleCollisions.length > 0);
  const layoutFindings = [
    ...overflowPages.map((page) => `${page.file}: ${page.overflowPixels} edge pixels at ${JSON.stringify(page.overflowBoundsPx)}`),
    ...collisionPages.map((page) => `${page.file}: ${page.ruleCollisions.length} text/rule collision region(s) at ${page.ruleCollisions.map((collision) => `y=${collision.yPx}`).join(", ")}`),
  ];
  gates.push({
    gate: "layout",
    pass: layout.pass,
    detail: layout.pass
      ? `raster layout clean across ${layout.pages.length} page(s) via ${layout.renderer}`
      : layout.error ?? `layout defects: ${layoutFindings.join("; ")}`,
    hint: layout.pass
      ? undefined
      : layout.unavailable
        ? installHint(layout.unavailable)
        : "shorten or wrap the affected field; keep text inside the safe content area and rerun reevaluate",
  });

  gates.push({
    gate: "layout:density",
    pass: layout.underfilledPages.length === 0,
    detail: layout.underfilledPages.length === 0
      ? `page fill is professional across ${layout.pages.length} page(s)`
      : `underfilled final page: ${layout.underfilledPages.join(", ")}`,
    hint: layout.underfilledPages.length === 0
      ? undefined
      : docType === "cv"
        ? densityHint(expected, pages)
        : "the letter's page is underfilled: add a verified, role-specific paragraph; do not pad",
  });

  const text = existsSync(pdfPath) ? await extractText(pdfPath) : null;
  if (text === null) {
    gates.push({
      gate: "ats",
      pass: options.allowMissingAts ? null : false,
      detail: options.allowMissingAts
        ? "pdftotext not installed — explicit degraded mode, ATS gate not verified"
        : "pdftotext not installed — required ATS gate cannot run",
      hint: "install Poppler (brew install poppler / apt install poppler-utils), or use --allow-missing-ats only for a non-shipping local check",
    });
  } else {
    for (const check of checkAtsQuality(text, docType === "cv")) {
      gates.push({
        gate: `ats:${check.name}`,
        pass: check.pass,
        detail: check.detail ?? "ok",
        hint: check.pass ? undefined : "contact details and body text must survive as literal text — avoid icon-only contact lines",
      });
    }
  }

  const parsed = parseFileName(basename(pdfPath, ".pdf"));
  const expectedPrefix = options.profileName ? documentNameSlug(options.profileName) : null;
  const actualPrefix = basename(pdfPath, ".pdf").split("_")[0] ?? "";
  const identityPass = expectedPrefix === null || actualPrefix === expectedPrefix;
  gates.push({
    gate: "naming",
    pass: parsed !== null && parsed.docType === docType && identityPass,
    detail:
      parsed === null
        ? `"${basename(pdfPath)}" does not match the convention`
        : parsed.docType !== docType
          ? `file carries ${parsed.docType.toUpperCase()} suffix but is a ${docType.toUpperCase()}`
          : identityPass
            ? "convention ok"
            : `filename identity "${actualPrefix}" does not match profile identity "${expectedPrefix}"`,
    hint:
      parsed !== null && parsed.docType === docType && identityPass
        ? undefined
        : identityPass
          ? "run: bun run naming show <company> <role> — then regenerate or git mv to the printed name"
          : "regenerate the document so the filename comes from the active profile; do not rename a document whose content uses another identity",
  });

  const pass = gates.every((g) => g.pass !== false);
  return { file: sourceOrPdf, docType, gates, pass };
}

/**
 * Today's convention path, or the newest dated folder that holds the document:
 * a gate run the day after `render` must still find what render wrote.
 */
export function applicationOutputPath(docType: "cv" | "cl", company: string, role: string, config: DocConfig): string {
  const today = buildOutputPath(docType, company, role, config);
  const exists = (pdf: string) => existsSync(resolve(ROOT, pdf)) || existsSync(resolve(ROOT, pdf.replace(/\.pdf$/, ".typ"))) || existsSync(resolve(ROOT, pdf.replace(/\.pdf$/, ".tex")));
  if (exists(today)) return today;
  const companyDir = dirname(applicationDir(company, config));
  const dates = existsSync(resolve(ROOT, companyDir)) ? readdirSync(resolve(ROOT, companyDir)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse() : [];
  for (const date of dates) {
    const candidate = buildOutputPath(docType, company, role, config, date);
    if (exists(candidate)) return candidate;
  }
  return today;
}

export async function main(): Promise<number> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      company: { type: "string" },
      role: { type: "string" },
      type: { type: "string" },
      file: { type: "string" },
      help: { type: "boolean", short: "h" },
      "allow-missing-ats": { type: "boolean" },
      market: { type: "string" },
      profile: { type: "string" },
    },
    strict: true,
  });

  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  // Resolve the profile first: `application render` names files after the
  // profile identity, so the company/role lookup must use the same name. Reading
  // only data/config.json made a first-run workspace (no config) look for files
  // render never wrote (issue #11). The default profile path matches render's.
  const profilePath = resolve(process.cwd(), typeof values.profile === "string" ? values.profile : join(ROOT, "data", "profile.json"));
  let profileName: string | undefined;
  if (existsSync(profilePath)) {
    try {
      profileName = profileDocumentName(Profile.parse(JSON.parse(readFileSync(profilePath, "utf-8"))).identity) || undefined;
    } catch {
      profileName = undefined;
    }
  }

  const docs: Array<{ path: string; docType: "cv" | "cl" }> = [];

  if (typeof values.file === "string") {
    const parsed = parseFileName(basename(values.file, extname(values.file)));
    const docType = parsed?.docType ?? (values.file.includes(loadConfig().coverDir) || /_CL\./.test(values.file) ? "cl" : "cv");
    docs.push({ path: values.file, docType });
  } else if (typeof values.company === "string" && typeof values.role === "string") {
    const which = typeof values.type === "string" ? values.type : "both";
    const config = profileName ? { ...loadConfig(), name: profileName } : loadConfig();
    if (which === "cv" || which === "both") docs.push({ path: applicationOutputPath("cv", values.company, values.role, config), docType: "cv" });
    if (which === "cl" || which === "both") docs.push({ path: applicationOutputPath("cl", values.company, values.role, config), docType: "cl" });
  } else {
    process.stderr.write(JSON.stringify({ error: "need --file or both --company and --role", code: "BAD_ARGS" }) + "\n");
    return 1;
  }

  const documents: DocReport[] = [];
  for (const d of docs) {
    documents.push(await reevaluateDoc(d.path, d.docType, {
      allowMissingAts: values["allow-missing-ats"] === true,
      ...(typeof values.market === "string" ? { market: values.market } : {}),
      ...(profileName ? { profileName } : {}),
    }));
  }
  const pass = documents.every((d) => d.pass);
  process.stdout.write(JSON.stringify({ documents, pass }, null, 2) + "\n");
  return pass ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
