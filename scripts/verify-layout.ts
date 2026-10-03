import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveTypstCommand } from "../src/resolve-bin.js";
import { CODE_ROOT, WORKSPACE as ROOT, typstRoot } from "../src/paths.js";

const SCRATCH_ROOT = join(ROOT, "data", "scratch");
const RASTER_PPI = 192;
const SAFE_INSET_MM = 10;
const ACCENT = { red: 26, green: 82, blue: 118 };
const MIN_RULE_WIDTH_RATIO = 0.35;
const RULE_COLLISION_BAND_PX = 6;
const RULE_STROKE_HALF_HEIGHT_PX = 4;
const MIN_COLLISION_PIXELS = 12;
const MIN_RULE_Y_PX = 220; // excludes decorative/name typography in the header area

export interface RuleCollision {
  yPx: number;
  xMin: number;
  xMax: number;
  nonRuleInkPixels: number;
}

export interface LayoutPageReport {
  file: string;
  widthPx: number;
  heightPx: number;
  safeInsetMm: number;
  safeInsetPx: number;
  overflowPixels: number;
  overflowBoundsPx: { xMin: number; yMin: number; xMax: number; yMax: number } | null;
  ruleCollisions: RuleCollision[];
  /** Bounding box of all visible ink inside the page. */
  contentBoundsPx: { xMin: number; yMin: number; xMax: number; yMax: number } | null;
  /** Share of the page below the final piece of visible content. */
  trailingWhitespaceRatio: number;
  /** True when the final page is mostly empty, which reads as an unfinished document. */
  underfilled: boolean;
  pass: boolean;
}

export interface LayoutReport {
  pass: boolean;
  renderer: "typst" | null;
  pages: LayoutPageReport[];
  underfilledPages: string[];
  error?: string;
  /** The rasterizer could not run at all: install the named tool, the document is not at fault. */
  unavailable?: string;
}

async function run(command: string[], cwd = ROOT): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}

function failure(error: string, unavailable?: string): LayoutReport {
  return { pass: false, renderer: null, pages: [], underfilledPages: [], error, ...(unavailable ? { unavailable } : {}) };
}

function isInk(red: number, green: number, blue: number, alpha: number): boolean {
  // Detect anti-aliased text and rules while treating paper/near-white fills as background.
  return alpha > 10 && Math.min(red, green, blue) < 245;
}

function isAccent(red: number, green: number, blue: number, alpha: number): boolean {
  return alpha > 10
    && Math.abs(red - ACCENT.red) <= 12
    && Math.abs(green - ACCENT.green) <= 12
    && Math.abs(blue - ACCENT.blue) <= 12;
}

function accentRunsInRow(pixels: Uint8ClampedArray, width: number, y: number): Array<{ xMin: number; xMax: number }> {
  let accentPixels = 0;
  let xMin = width;
  let xMax = -1;
  for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    if (!isAccent(pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3])) continue;
    accentPixels++;
    xMin = Math.min(xMin, x);
    xMax = Math.max(xMax, x);
  }
  // A rule can be interrupted by the very text collision we need to catch, so
  // use total accent coverage across the row instead of one uninterrupted run.
  return accentPixels >= width * MIN_RULE_WIDTH_RATIO && xMax - xMin >= width * MIN_RULE_WIDTH_RATIO
    ? [{ xMin, xMax }]
    : [];
}

function detectRuleCollisions(pixels: Uint8ClampedArray, width: number, height: number): RuleCollision[] {
  const candidates: Array<{ yPx: number; xMin: number; xMax: number }> = [];
  for (let y = MIN_RULE_Y_PX; y < height; y++) {
    for (const run of accentRunsInRow(pixels, width, y)) candidates.push({ yPx: y, ...run });
  }

  // A stroke can span several anti-aliased raster rows. Collapse those rows to
  // its centre before sampling around it, otherwise the stroke's edge pixels
  // look like non-rule ink.
  const rules: Array<{ yPx: number; xMin: number; xMax: number }> = [];
  let group: Array<{ yPx: number; xMin: number; xMax: number }> = [];
  const flushGroup = () => {
    if (group.length === 0) return;
    rules.push({
      yPx: Math.round(group.reduce((total, item) => total + item.yPx, 0) / group.length),
      xMin: Math.min(...group.map((item) => item.xMin)),
      xMax: Math.max(...group.map((item) => item.xMax)),
    });
    group = [];
  };
  for (const candidate of candidates) {
    const previous = group[group.length - 1];
    if (previous && candidate.yPx - previous.yPx <= 3 && Math.abs(candidate.xMin - previous.xMin) <= 2 && Math.abs(candidate.xMax - previous.xMax) <= 2) {
      group.push(candidate);
    } else {
      flushGroup();
      group.push(candidate);
    }
  }
  flushGroup();

  const collisions: RuleCollision[] = [];
  for (const rule of rules) {
    let nonRuleInkPixels = 0;
    for (let y = Math.max(0, rule.yPx - RULE_COLLISION_BAND_PX); y <= Math.min(height - 1, rule.yPx + RULE_COLLISION_BAND_PX); y++) {
      if (Math.abs(y - rule.yPx) <= RULE_STROKE_HALF_HEIGHT_PX) continue;
      for (let x = rule.xMin; x <= rule.xMax; x++) {
        const offset = (y * width + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const alpha = pixels[offset + 3];
        if (isInk(red, green, blue, alpha) && !isAccent(red, green, blue, alpha)) nonRuleInkPixels++;
      }
    }
    if (nonRuleInkPixels >= MIN_COLLISION_PIXELS) collisions.push({ ...rule, nonRuleInkPixels });
  }
  return collisions;
}

type Canvas = typeof import("@napi-rs/canvas");

// Loaded on first use: the native module is ~64 MB, so bundled builds keep it
// external and only the raster gate needs it. Missing → the gate fails with a
// clear reason (never a pass).
let canvasModule: Canvas | null | undefined;
async function loadCanvas(): Promise<Canvas | null> {
  if (canvasModule === undefined) {
    try {
      canvasModule = await import("@napi-rs/canvas");
    } catch {
      canvasModule = null;
    }
  }
  return canvasModule;
}

async function analyzePage(path: string, { createCanvas, loadImage }: Canvas): Promise<LayoutPageReport> {
  const image = await loadImage(path);
  const widthPx = image.width;
  const heightPx = image.height;
  const canvas = createCanvas(widthPx, heightPx);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, widthPx, heightPx);
  const pixels = context.getImageData(0, 0, widthPx, heightPx).data;
  const safeInsetPx = Math.round(SAFE_INSET_MM / 25.4 * RASTER_PPI);

  let overflowPixels = 0;
  let xMin = widthPx;
  let yMin = heightPx;
  let xMax = -1;
  let yMax = -1;

  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      const offset = (y * widthPx + x) * 4;
      if (!isInk(pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3])) continue;
      xMin = Math.min(xMin, x);
      yMin = Math.min(yMin, y);
      xMax = Math.max(xMax, x);
      yMax = Math.max(yMax, y);
      if (x >= safeInsetPx && x < widthPx - safeInsetPx && y >= safeInsetPx && y < heightPx - safeInsetPx) continue;
      overflowPixels++;
    }
  }

  const ruleCollisions = detectRuleCollisions(pixels, widthPx, heightPx);

  const contentBoundsPx = xMax < 0 ? null : { xMin, yMin, xMax, yMax };
  const trailingWhitespaceRatio = contentBoundsPx
    ? Math.max(0, (heightPx - safeInsetPx - contentBoundsPx.yMax) / (heightPx - safeInsetPx * 2))
    : 1;

  return {
    file: path.split("/").pop() ?? path,
    widthPx,
    heightPx,
    safeInsetMm: SAFE_INSET_MM,
    safeInsetPx,
    overflowPixels,
    overflowBoundsPx: overflowPixels === 0 ? null : { xMin, yMin, xMax, yMax },
    ruleCollisions,
    contentBoundsPx,
    trailingWhitespaceRatio,
    underfilled: false,
    pass: overflowPixels === 0 && ruleCollisions.length === 0,
  };
}

/**
 * Rasterize a generated Typst source at high DPI and reject visible ink inside
 * a physical edge safety band. This fails closed for PDF-only/LaTeX documents
 * because this Snap Bun runtime cannot execute host PDF rasterizers reliably.
 */
export const NON_FINAL_PAGE_SLACK = 0.17;

export async function checkLayout(pdfPath: string, sourcePath?: string): Promise<LayoutReport> {
  if (!existsSync(pdfPath)) return failure(`PDF missing: ${pdfPath}`);
  if (!sourcePath?.endsWith(".typ") || !existsSync(sourcePath)) {
    return failure("Layout verification requires the generated Typst source; PDF-only and LaTeX documents cannot be rasterized in this runtime");
  }

  const typst = resolveTypstCommand(CODE_ROOT);
  if (!typst) return failure("Typst is unavailable for layout rasterization", "typst");
  const canvas = await loadCanvas();
  if (!canvas) return failure("Raster layout check unavailable: @napi-rs/canvas is not installed (run from a checkout or install it next to the plugin)", "@napi-rs/canvas");

  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const outputDir = mkdtempSync(join(SCRATCH_ROOT, "layout-raster-"));
  try {
    const raster = await run([
      ...typst,
      "compile",
      "--root",
      typstRoot(),
      sourcePath,
      join(outputDir, "page-{n}.png"),
      "--ppi",
      String(RASTER_PPI),
    ]);
    if (raster.code !== 0) return failure(`Layout rasterization failed: ${(raster.stderr || raster.stdout).trim()}`);

    const pages = readdirSync(outputDir)
      .filter((file) => file.endsWith(".png"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((file) => join(outputDir, file));
    if (pages.length === 0) return failure("Layout rasterization produced no pages");

    const reports = await Promise.all(pages.map((page) => analyzePage(page, canvas)));
    // Typst flows content into every page but the last. Only the final page may
    // legitimately end early; a mostly empty final page reads as an unfinished
    // document even though every glyph is safely inside the margins.
    // A non-final page may end early by the smallest unit that cannot split:
    // a section heading, an entry title with its spacing and a three-line
    // paragraph (Typst will not leave one line of it alone). Measured across
    // all ten layouts, that unit is up to 16% of a page.
    for (const report of reports.slice(0, -1)) {
      report.underfilled = report.trailingWhitespaceRatio > NON_FINAL_PAGE_SLACK;
    }
    const final = reports.at(-1);
    if (final) final.underfilled = final.trailingWhitespaceRatio > 0.35;
    return {
      pass: reports.every((report) => report.pass),
      renderer: "typst",
      pages: reports,
      underfilledPages: reports.filter((report) => report.underfilled).map((report) => report.file),
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}
