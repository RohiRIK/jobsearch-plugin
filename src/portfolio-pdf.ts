import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveBin } from "./resolve-bin.js";
import type { Profile } from "./profile-schemas.js";

export function portfolioRequiredText(profile: Profile): string[] {
  return [...new Set([
    ...(profile.projects ?? []).filter(p => p.disclosure !== "restricted" && p.disclosure !== "unreviewed").map(p => p.name),
    ...(profile.skills ?? []).flatMap(group => group.skills),
    ...(profile.education ?? []).flatMap(item => [item.degree, item.institution, item.field]),
    ...(profile.certifications ?? []).map(item => item.name),
  ].filter(Boolean))];
}

export interface PortfolioPdfReceipt {
  pages: number;
  bytes: number;
  preservationChecked: true;
  requiredItems: number;
  visualInspection: "required";
}

/** Print only generated, self-contained markup; never execute document scripts. */
export function exportPortfolioPdf(html: string, output: string, requiredText: string[]): PortfolioPdfReceipt {
  const browser = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"].map(resolveBin).find(Boolean);
  const pdfinfo = resolveBin("pdfinfo"), pdftotext = resolveBin("pdftotext");
  const missing = [!browser && "Chromium/Chrome", !pdfinfo && "pdfinfo", !pdftotext && "pdftotext"].filter(Boolean);
  if (!browser || !pdfinfo || !pdftotext) throw new Error(`Portfolio PDF requires Chromium/Chrome plus Poppler. Missing: ${missing.join(", ")}. HTML export remains available with --format html.`);
  const dest = resolve(output);
  mkdirSync(dirname(dest), { recursive: true });
  // Same directory makes the final verified-file rename atomic across filesystems.
  const temp = mkdtempSync(join(dirname(dest), ".portfolio-pdf-"));
  const browserState = mkdtempSync(join(tmpdir(), "jobsearch-chromium-"));
  try {
    const input = join(temp, "portfolio.html"), pdf = join(temp, "portfolio.pdf");
    // CSP precedes every document resource: prohibit scripts/network/local-file
    // reads while allowing inline CSS, embedded fonts and data-URL portraits.
    const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">`;
    const print = `<style>@page{size:A4;margin:15mm 16mm}@media print{html,body{margin:0!important;background:white!important;color:#25252b!important}main,header,footer,section,.wrap,.container,.project-grid{display:block!important;position:static!important;overflow:visible!important;height:auto!important;min-height:0!important}main,.wrap,.container{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}header{margin-bottom:14pt!important}article,.project,.skill-group{break-inside:avoid}h1,h2,h3{break-after:avoid}p,li{orphans:3;widows:3}details{content-visibility:visible!important}footer{margin-top:14pt!important}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>`;
    if (!/<head(?:\s[^>]*)?>/i.test(html)) throw new Error("Generated portfolio is missing its HTML head");
    const printable = html.replace(/<head(?:\s[^>]*)?>/i, match => match + policy).replace(/<\/head>/i, print + "</head>").replace(/<details\b[^>]*>/gi, "<section>").replace(/<\/details>/gi, "</section>").replace(/<summary\b[^>]*>/gi, "<h3>").replace(/<\/summary>/gi, "</h3>");
    writeFileSync(input, printable);
    const result = spawnSync(browser, ["--headless", "--disable-gpu", "--disable-extensions", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${browserState}`, "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, pathToFileURL(input).href], { timeout: 90_000, encoding: "utf8", maxBuffer: 4_000_000 });
    if (result.error || result.status !== 0 || !existsSync(pdf)) throw new Error(`Chromium PDF export failed: ${result.error?.message ?? result.stderr.slice(0, 3000)}`);
    const bytes = readFileSync(pdf);
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Chromium did not produce a valid PDF signature");
    const info = spawnSync(pdfinfo, [pdf], { encoding: "utf8", timeout: 20_000 });
    const text = spawnSync(pdftotext, ["-layout", pdf, "-"], { encoding: "utf8", timeout: 20_000, maxBuffer: 16_000_000 });
    const pages = Number(/^Pages:\s+(\d+)/m.exec(info.stdout ?? "")?.[1]);
    if (info.status !== 0 || text.status !== 0 || !Number.isInteger(pages) || pages < 1) throw new Error("Portfolio PDF inspection failed; output has not replaced the last good PDF");
    const normalized = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
    const extracted = normalized(text.stdout);
    const missing = requiredText.filter(value => !extracted.includes(normalized(value)));
    if (missing.length) throw new Error(`Portfolio PDF lost required content: ${missing.join("; ")}`);
    const perPage = text.stdout.split("\f");
    if (perPage.at(-1)?.trim() === "") perPage.pop();
    if (perPage.length !== pages || perPage.some(page => !page.trim())) throw new Error("Portfolio PDF contains an empty page; inspect print layout before delivery");
    renameSync(pdf, dest);
    return { pages, bytes: bytes.length, preservationChecked: true, requiredItems: requiredText.length, visualInspection: "required" };
  } finally {
    rmSync(temp, { recursive: true, force: true });
    rmSync(browserState, { recursive: true, force: true });
  }
}
