/**
 * `render --fit`: when the chosen CV layout leaves the last page nearly empty
 * or breaks the market's page budget, compile the other layouts on the same
 * content and REPORT which ones fit. It never switches layout: the layout is
 * the user's choice, and a silent switch would override it (issue #7).
 *
 * Trials are written as hidden files next to the real CV so the template's
 * relative imports resolve identically, and are always removed afterwards.
 */
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compile } from "../build/cli.js";
import { checkLayout } from "../verify-layout.js";
import type { CvLayoutOption } from "../../src/cv-options.js";

export interface FitTrial {
  layout: string;
  pages: number | null;
  /** Last page under the density threshold the gate enforces. */
  underfilled: boolean;
  withinBudget: boolean;
  /** No edge overflow or rule collision, not underfilled, within budget. */
  fits: boolean;
  error?: string;
}

export interface FitReport {
  chosen: FitTrial;
  /** Other layouts, densest first; empty when the chosen layout already fits. */
  alternatives: FitTrial[];
  suggestion: string;
  /** Set when the raster check cannot run (missing Typst or canvas); nothing was judged. */
  unavailable?: string;
}

const DENSITY_ORDER: Record<CvLayoutOption["density"], number> = { compact: 0, balanced: 1, roomy: 2 };

async function trial(layout: string, source: string, budget: readonly [number, number]): Promise<FitTrial & { unavailable?: string }> {
  const pdf = source.replace(/\.typ$/, ".pdf");
  const built = await compile(source, pdf);
  if (built.status !== "success") {
    return { layout, pages: null, underfilled: false, withinBudget: false, fits: false, error: built.error ?? "compile failed", ...(built.missingTool ? { unavailable: built.missingTool } : {}) };
  }
  const report = await checkLayout(pdf, source);
  if (report.unavailable) return { layout, pages: null, underfilled: false, withinBudget: false, fits: false, unavailable: report.unavailable };
  const pages = report.pages.length || null;
  const underfilled = report.underfilledPages.length > 0;
  const withinBudget = pages !== null && pages >= budget[0] && pages <= budget[1];
  return { layout, pages, underfilled, withinBudget, fits: report.pass && !underfilled && withinBudget };
}

export async function fitReport(input: {
  /** Typst source for a layout, rendered from the same draft and profile as the real CV. */
  render: (layout: string) => string;
  /** The real CV source written by render. */
  cvPath: string;
  chosen: string;
  budget: readonly [number, number];
  layouts: CvLayoutOption[];
}): Promise<FitReport> {
  const dir = join(input.cvPath, "..");
  const chosenTrial = await trial(input.chosen, input.cvPath, input.budget);
  if (chosenTrial.unavailable) {
    return { chosen: chosenTrial, alternatives: [], unavailable: chosenTrial.unavailable, suggestion: `fit check unavailable: install ${chosenTrial.unavailable} (jobsearch status shows what is missing)` };
  }
  if (chosenTrial.fits) return { chosen: chosenTrial, alternatives: [], suggestion: `${input.chosen} fits the ${input.budget.join("-")} page budget; no change needed` };

  const others = input.layouts
    .filter((option) => option.id !== input.chosen)
    .sort((a, b) => DENSITY_ORDER[a.density] - DENSITY_ORDER[b.density]);
  const alternatives: FitTrial[] = [];
  const temp: string[] = [];
  try {
    for (const option of others) {
      const source = join(dir, `.fit-${option.id}.typ`);
      temp.push(source, source.replace(/\.typ$/, ".pdf"));
      writeFileSync(source, input.render(option.id));
      const { unavailable: _, ...result } = await trial(option.id, source, input.budget);
      alternatives.push(result);
    }
  } finally {
    for (const file of temp) if (existsSync(file)) rmSync(file, { force: true });
  }

  const why = chosenTrial.error
    ? `${input.chosen} did not compile`
    : !chosenTrial.withinBudget
      ? `${input.chosen} runs to ${chosenTrial.pages} page(s), outside the ${input.budget.join("-")} page budget`
      : chosenTrial.underfilled
        ? `${input.chosen} leaves the last page nearly empty`
        : `${input.chosen} has a layout defect`;
  const fitting = alternatives.filter((t) => t.fits);
  const suggestion = fitting.length
    ? `${why}. Layouts that fit with this content: ${fitting.map((t) => `${t.layout} (${t.pages} p)`).join(", ")}. Ask the user which to use, then re-render with --layout <id> --force; nothing was changed.`
    : `${why}, and no layout fits with this content. Tighten the draft to the budget or add verified evidence the profile already holds; never pad or drop a true fact.`;
  return { chosen: chosenTrial, alternatives, suggestion };
}
