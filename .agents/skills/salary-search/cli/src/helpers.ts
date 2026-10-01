import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Error output — mirrors the portal-skill contract: stderr JSON, exit 1.
// ---------------------------------------------------------------------------

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n");
}

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

const categoryDataSchema = z.object({
  count: z.number().nullable().optional(),
  index: z.union([z.number(), z.string()]).nullable().optional(),
});

const companyEntrySchema = z
  .object({
    company: z.string(),
    city: z.string().optional(),
    categories: z.record(categoryDataSchema).optional(),
  })
  .passthrough();

const salaryDataSchema = z.object({
  metadata: z
    .object({
      source: z.string().optional(),
      index_baseline: z.number().optional(),
      index_label: z.string().optional(),
      baseline_description: z.string().optional(),
    })
    .partial()
    .optional(),
  companies: z.array(companyEntrySchema).optional(),
});

export type CategoryData = z.infer<typeof categoryDataSchema>;
export type CompanyEntry = z.infer<typeof companyEntrySchema>;
export type SalaryMetadata = NonNullable<z.infer<typeof salaryDataSchema>["metadata"]>;
export type SalaryData = z.infer<typeof salaryDataSchema>;

/**
 * Resolve the salary data file. Precedence: explicit flag, then $SALARY_DATA,
 * then `salary_data.json` in the current working directory (the repo root when
 * invoked via `bun run skills/salary-search/cli/src/cli.ts`).
 */
export function resolveDataFile(flag?: string): string {
  if (flag) return resolve(flag);
  if (process.env.SALARY_DATA) return resolve(process.env.SALARY_DATA);
  return resolve(process.cwd(), "salary_data.json");
}

/**
 * Thrown when the data file is missing so the caller can print the guidance
 * block and exit — the /apply workflow treats this as "skip salary step".
 */
export class MissingDataError extends Error {
  constructor(public readonly path: string) {
    super(`salary data file not found: ${path}`);
    this.name = "MissingDataError";
  }
}

export function loadData(dataFile: string): SalaryData {
  if (!existsSync(dataFile)) {
    throw new MissingDataError(dataFile);
  }
  const raw = readFileSync(dataFile, "utf-8");
  return salaryDataSchema.parse(JSON.parse(raw));
}

// ---------------------------------------------------------------------------
// Fuzzy company-name matching
// ---------------------------------------------------------------------------

// Danish <-> anglicized spelling variants.
const SPELLING_VARIANTS: Record<string, string> = {
  ø: "o",
  æ: "ae",
  å: "aa",
  ö: "o",
  ä: "ae",
  ü: "u",
};

// Legal suffixes and noise stripped when matching company names.
// ASCII \b boundaries follow the original Python; Hebrew suffixes are matched
// literally because \b does not behave across Hebrew script.
const STRIP_PATTERNS: RegExp[] = [
  // Danish / Nordic legal forms
  /\ba\/s\b/g,
  /\baps\b/g,
  /\bi\/s\b/g,
  /\bp\/s\b/g,
  /\bk\/s\b/g,
  /\bivs\b/g,
  /\bamba\b/g,
  /\ba\.m\.b\.a\.\b/g,
  /\b(?:oyj|oy|ab|asa|hf|ehf)\b/g, // Finnish/Swedish/Norwegian/Icelandic
  /\(vg\)/g,
  /\(.*?\)/g, // (VG) and other parentheticals
  // Continental European legal forms
  /\bgmbh\b/g,
  /\b(?:ag|kg|kgaa|gbr|ug)\b/g, // German
  /\bs\.?a\.?r\.?l\.?\b/g,
  /\bs\.?a\.?s\.?\b/g,
  /\bs\.?p\.?a\.?\b/g,
  /\bs\.?l\.?\b/g,
  /\bs\.?a\.?\b/g, // Spanish/French/Italian S.A.
  /\bb\.?v\.?\b/g,
  /\bn\.?v\.?\b/g, // Dutch/Belgian
  /\bnv\/sa\b/g,
  /\bsp\.?\s*z\s*o\.?o\.?\b/g, // Polish
  // American / English legal forms
  /\b(?:inc|incorporated|corp|corporation|co|company|llc|llp|lp|ltd|limited|plc)\b\.?/g,
  // Geographic / structural noise
  /\bdanmark\b/g,
  /\bdenmark\b/g,
  /\bscandinavia\b/g,
  /\bnordic\b/g,
  /\beurope\b/g,
  /\b(?:usa|u\.s\.a\.|us)\b/g,
  /\bisrael\b/g,
  /ישראל/g,
  /\b(?:group|holding|holdings|international|global|worldwide|technologies|solutions|systems)\b/g,
  /,\s*.*$/g, // everything after a comma (sub-entities)
  // Israeli / Hebrew legal suffix
  /בע["״]?מ/g, // בע"מ / בעמ (Ltd)
];

// Characters kept in a normalized token: latin, Danish, digits, Hebrew block.
const KEEP_RE = /[a-zæøåöäü0-9א-ת]/g;
const WORD_RE = /[a-zæøåöäü0-9א-ת]+/g;

const HEBREW_FINALS: Record<string, string> = {
  ך: "כ",
  ם: "מ",
  ן: "נ",
  ף: "פ",
  ץ: "צ",
};

/**
 * Fold Hebrew text for matching: strip niqqud / cantillation, drop geresh and
 * gershayim punctuation, and normalize final letter forms to their base forms
 * so "בעמ"-style variants collapse together.
 */
function foldHebrew(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, "") // niqqud + te'amim
    .replace(/[׳״]/g, "") // geresh, gershayim
    .replace(/[ךםןףץ]/g, (c) => HEBREW_FINALS[c] ?? c);
}

function applyStrip(s: string): string {
  let out = s;
  for (const pat of STRIP_PATTERNS) out = out.replace(pat, "");
  return out;
}

/** Normalize a string for robust fuzzy matching. */
export function normalize(input: string): string {
  const folded = foldHebrew(input.toLowerCase().trim());
  const stripped = applyStrip(folded);
  return (stripped.match(KEEP_RE) ?? []).join("");
}

/** Convert Danish/Nordic characters to anglicized equivalents. */
export function anglicize(input: string): string {
  let s = input.toLowerCase();
  for (const [danish, english] of Object.entries(SPELLING_VARIANTS)) {
    s = s.split(danish).join(english);
  }
  return s;
}

/** Extract meaningful words from a company name, ignoring noise. */
export function extractCoreWords(input: string): string[] {
  const stripped = applyStrip(foldHebrew(input.toLowerCase()));
  const words = stripped.match(WORD_RE) ?? [];
  return words.filter((w) => w.length > 1);
}

function intersects<T>(a: Set<T>, b: Set<T>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function intersection<T>(a: Set<T>, b: Set<T>): Set<T> {
  const out = new Set<T>();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

function anglicizedSet(words: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const w of words) out.add(anglicize(w));
  return out;
}

/** Compute a match score between 0 and 100 for ranking results. */
export function matchScore(query: string, entryName: string): number {
  const qNorm = normalize(query);
  const nNorm = normalize(entryName);

  if (!qNorm || !nNorm) return 0;
  if (qNorm === nNorm) return 100;

  if (nNorm.includes(qNorm)) {
    const ratio = qNorm.length / nNorm.length;
    if (qNorm.length <= 4 && ratio < 0.5) {
      const qWords = new Set(extractCoreWords(query));
      const nWords = new Set(extractCoreWords(entryName));
      if (intersects(qWords, nWords)) {
        return 80 + Math.floor(ratio * 10);
      }
      // no shared core word — fall through to weaker signals
    } else {
      return 80 + Math.floor(ratio * 10);
    }
  }
  if (qNorm.includes(nNorm)) {
    const ratio = nNorm.length / qNorm.length;
    if (nNorm.length <= 4 && ratio < 0.5) {
      // too-short spurious containment — fall through
    } else {
      return 80 + Math.floor(ratio * 10);
    }
  }

  const qAng = anglicize(qNorm);
  const nAng = anglicize(nNorm);
  if (qAng === nAng) return 85;
  if (qAng.includes(nAng) || nAng.includes(qAng)) {
    const shorter = Math.min(qAng.length, nAng.length);
    const longer = Math.max(qAng.length, nAng.length);
    if (shorter <= 4 && shorter / longer < 0.5) {
      const qWordsAng = anglicizedSet(extractCoreWords(query));
      const nWordsAng = anglicizedSet(extractCoreWords(entryName));
      if (intersects(qWordsAng, nWordsAng)) return 75;
    } else {
      return 75;
    }
  }

  const qWords = new Set(extractCoreWords(query));
  const nWords = new Set(extractCoreWords(entryName));
  if (qWords.size === 0 || nWords.size === 0) return 0;

  let overlap = intersection(qWords, nWords);
  if (overlap.size === 0) {
    overlap = intersection(anglicizedSet(qWords), anglicizedSet(nWords));
  }

  if (overlap.size > 0) {
    if (qWords.size === 1) {
      const qWord = [...qWords][0]!;
      const nWordsAng = anglicizedSet(nWords);
      if (nWords.has(qWord) || nWordsAng.has(anglicize(qWord))) return 70;
      return 0;
    }
    const coverage = overlap.size / qWords.size;
    return Math.floor(30 + coverage * 40);
  }

  return 0;
}

/** Search for a company by name. Returns matching entries sorted by relevance. */
export function searchCompany(
  data: SalaryData,
  query: string,
  city?: string,
): CompanyEntry[] {
  const companies = data.companies ?? [];
  const scored: Array<{ score: number; entry: CompanyEntry }> = [];

  for (const entry of companies) {
    if (city) {
      const cityLower = city.toLowerCase();
      const entryCity = (entry.city ?? "").toLowerCase();
      if (
        !entryCity.includes(cityLower) &&
        !anglicize(entryCity).includes(anglicize(cityLower))
      ) {
        continue;
      }
    }

    const score = matchScore(query, entry.company);
    if (score > 0) scored.push({ score, entry });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.entry.company.localeCompare(b.entry.company);
  });

  const minScore = 30;
  return scored.filter((s) => s.score >= minScore).map((s) => s.entry);
}

// ---------------------------------------------------------------------------
// Human-readable formatting
// ---------------------------------------------------------------------------

function titleCase(label: string): string {
  return label
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Format a single company entry for display. */
export function formatEntry(entry: CompanyEntry, metadata: SalaryMetadata): string {
  const lines: string[] = [];
  const bar = "=".repeat(60);
  lines.push(`\n${bar}`);
  lines.push(`  ${entry.company}`);
  if (entry.city) lines.push(`  Location: ${entry.city}`);
  lines.push(bar);

  // Category data (everything except company/city fields).
  let categories: Record<string, CategoryData> = entry.categories ?? {};
  if (Object.keys(categories).length === 0) {
    const skip = new Set(["company", "city", "categories"]);
    for (const [key, value] of Object.entries(entry)) {
      if (!skip.has(key) && value && typeof value === "object" && !Array.isArray(value)) {
        categories[key] = value as CategoryData;
      }
    }
  }

  if (Object.keys(categories).length > 0) {
    const indexLabel = metadata.index_label ?? "Index";
    const baseline = metadata.index_baseline ?? 100;

    lines.push(
      `  ${"Category".padEnd(22)} ${"Count".padStart(6)} ${indexLabel.padStart(8)}  ${"vs Baseline".padStart(10)}`,
    );
    lines.push(`  ${"-".repeat(50)}`);

    for (const [label, data] of Object.entries(categories)) {
      const displayLabel = titleCase(label);
      const count = data.count;
      const index = data.index;
      if (count != null || index != null) {
        const countStr = count ? String(count) : "-";
        let indexStr: string;
        let diffStr: string;
        if (index != null && typeof index === "number") {
          const diff = index - baseline;
          const sign = diff >= 0 ? "+" : "";
          indexStr = index.toFixed(1);
          diffStr = `${sign}${diff.toFixed(1)}%`;
        } else if (index != null) {
          indexStr = String(index);
          diffStr = "";
        } else {
          indexStr = "N/A*";
          diffStr = "";
        }
        lines.push(
          `  ${displayLabel.padEnd(22)} ${countStr.padStart(6)} ${indexStr.padStart(8)}  ${diffStr.padStart(10)}`,
        );
      }
    }

    lines.push(`\n  * N/A = Too few employees to publish (privacy)`);
    if (metadata.baseline_description) {
      lines.push(`  ${metadata.baseline_description}`);
    } else {
      lines.push(`  ${indexLabel} ${baseline} = baseline`);
    }
  } else {
    const skip = new Set(["company", "city", "categories"]);
    for (const [key, value] of Object.entries(entry)) {
      if (!skip.has(key)) {
        lines.push(`  ${titleCase(key)}: ${String(value)}`);
      }
    }
  }

  return lines.join("\n");
}
