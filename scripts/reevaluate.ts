#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { buildOutputPath, buildSourcePath, loadConfig, parseFileName } from "../src/naming.js";
import { checkAtsQuality, extractText, getPageCount } from "./verify-ats.js";
import { compile } from "./build/cli.js";
import { checkLayout } from "./verify-layout.js";
import { getMarketProfile } from "../src/market-profiles.js";
import { documentNameSlug, profileDocumentName } from "../src/naming.js";
import { Profile } from "../src/profile-schemas.js";
import { WORKSPACE as ROOT } from "../src/paths.js";

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
      hint: result.status === "success" ? undefined : "fix the source errors above and rerun",
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
      : "add verified evidence, use a denser market-appropriate template, or shorten the document to its correct page budget; do not pad with empty sections",
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

  const docs: Array<{ path: string; docType: "cv" | "cl" }> = [];

  if (typeof values.file === "string") {
    const parsed = parseFileName(basename(values.file, extname(values.file)));
    const docType = parsed?.docType ?? (values.file.includes(loadConfig().coverDir) || /_CL\./.test(values.file) ? "cl" : "cv");
    docs.push({ path: values.file, docType });
  } else if (typeof values.company === "string" && typeof values.role === "string") {
    const which = typeof values.type === "string" ? values.type : "both";
    if (which === "cv" || which === "both") docs.push({ path: buildOutputPath("cv", values.company, values.role), docType: "cv" });
    if (which === "cl" || which === "both") docs.push({ path: buildOutputPath("cl", values.company, values.role), docType: "cl" });
  } else {
    process.stderr.write(JSON.stringify({ error: "need --file or both --company and --role", code: "BAD_ARGS" }) + "\n");
    return 1;
  }

  let profileName: string | undefined;
  if (typeof values.profile === "string") {
    const profilePath = resolve(process.cwd(), values.profile);
    if (existsSync(profilePath)) {
      try {
        profileName = profileDocumentName(Profile.parse(JSON.parse(readFileSync(profilePath, "utf-8"))).identity);
      } catch {
        profileName = undefined;
      }
    }
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
