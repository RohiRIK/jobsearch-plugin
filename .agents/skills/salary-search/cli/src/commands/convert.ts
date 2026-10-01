import { existsSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";
import * as XLSX from "xlsx";
import { writeError, type CompanyEntry } from "../helpers.js";

// Column-name patterns for auto-detection (lowercased, exact-match for
// company/city, substring-match for count/index — mirrors the Python tool).
const COMPANY_PATTERNS = new Set([
  "firma",
  "company",
  "virksomhed",
  "employer",
  "arbejdsgiver",
  "חברה",
  "מעסיק",
]);
const CITY_PATTERNS = new Set([
  "by",
  "city",
  "kommune",
  "location",
  "lokation",
  "sted",
  "עיר",
  "מיקום",
]);
const COUNT_PATTERNS = ["antal", "count", "number", "n", "employees", "medarbejdere", "מספר", "עובדים"];
const INDEX_PATTERNS = ["indeks", "index", "idx", "salary", "løn", "median", "average", "gennemsnit", "שכר", "משכורת", "חציון", "ממוצע"];

type Cell = string | number | boolean | null;
type Row = Cell[];

interface CategorySpec {
  name: string;
  countCol?: number;
  indexCol?: number;
  valueCol?: number;
}

function detectColumnType(header: string): "count" | "index" | null {
  const h = header.toLowerCase().trim();
  for (const p of COUNT_PATTERNS) if (h.includes(p)) return "count";
  for (const p of INDEX_PATTERNS) if (h.includes(p)) return "index";
  return null;
}

function stripCategorySuffix(header: string, patterns: string[]): string {
  let name = header.toLowerCase();
  for (const p of patterns) name = name.replace(p, "");
  return name.replace(/^[\s_-]+|[\s_-]+$/g, "");
}

function toInt(v: Cell): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toFloat(v: Cell): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

function parseSheet(rows: Row[], sheetTitle: string): CompanyEntry[] {
  // Find the header row within the first 10 rows.
  let headerRow = -1;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    for (const cell of rows[r] ?? []) {
      if (cell != null && COMPANY_PATTERNS.has(String(cell).trim().toLowerCase())) {
        headerRow = r;
        break;
      }
    }
    if (headerRow !== -1) break;
  }

  if (headerRow === -1) {
    log(`Warning: Could not find header row in sheet '${sheetTitle}'. Skipping.`);
    return [];
  }

  const headers = (rows[headerRow] ?? []).map((c) => (c != null ? String(c).trim() : ""));

  let companyCol = -1;
  let cityCol = -1;
  headers.forEach((h, i) => {
    const hl = h.toLowerCase();
    if (COMPANY_PATTERNS.has(hl)) companyCol = i;
    else if (CITY_PATTERNS.has(hl)) cityCol = i;
  });

  if (companyCol === -1) {
    log(`Warning: Could not find company column in sheet '${sheetTitle}'.`);
    return [];
  }

  // Data columns: everything that is not company/city and has a header.
  const dataCols: Array<[number, string]> = [];
  headers.forEach((h, i) => {
    if (i === companyCol || i === cityCol || !h) return;
    dataCols.push([i, h]);
  });

  // Group paired count/index columns into categories.
  const categories: CategorySpec[] = [];
  let i = 0;
  while (i < dataCols.length) {
    const [colIdx, colHeader] = dataCols[i]!;
    const colType = detectColumnType(colHeader);

    if (i + 1 < dataCols.length) {
      const [nextIdx, nextHeader] = dataCols[i + 1]!;
      const nextType = detectColumnType(nextHeader);

      if (colType === "count" && nextType === "index") {
        const name = stripCategorySuffix(colHeader, COUNT_PATTERNS) || `category_${categories.length + 1}`;
        categories.push({ name, countCol: colIdx, indexCol: nextIdx });
        i += 2;
        continue;
      }
      if (colType === "index" && nextType === "count") {
        const name = stripCategorySuffix(colHeader, INDEX_PATTERNS) || `category_${categories.length + 1}`;
        categories.push({ name, indexCol: colIdx, countCol: nextIdx });
        i += 2;
        continue;
      }
    }

    categories.push({ name: colHeader.toLowerCase().replace(/ /g, "_"), valueCol: colIdx });
    i += 1;
  }

  const companies: CompanyEntry[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const companyCell = row[companyCol];
    if (companyCell == null || String(companyCell).trim() === "") continue;

    const cats: Record<string, { count?: number | null; index?: number | string | null }> = {};
    for (const cat of categories) {
      if (cat.countCol != null && cat.indexCol != null) {
        cats[cat.name] = {
          count: toInt(row[cat.countCol] ?? null),
          index: toFloat(row[cat.indexCol] ?? null),
        };
      } else if (cat.valueCol != null) {
        const raw = row[cat.valueCol] ?? null;
        if (raw != null) {
          const num = toFloat(raw);
          cats[cat.name] = { index: num !== null ? num : String(raw) };
        }
      }
    }

    const entry: CompanyEntry = {
      company: String(companyCell).trim(),
      categories: cats,
    };
    if (cityCol !== -1) {
      const cityCell = row[cityCol];
      entry.city = cityCell != null ? String(cityCell).trim() : "";
    }
    companies.push(entry);
  }

  return companies;
}

export const convert = defineCommand({
  name: "convert",
  description: "Convert a salary Excel workbook into salary_data.json",
  options: {
    output: option(z.string().optional(), {
      short: "o",
      description: "Output JSON path (default: salary_data.json in the current directory)",
    }),
    source: option(z.string().optional(), {
      short: "s",
      description: "Name of the data source (e.g. 'Union Statistics 2025')",
    }),
    baseline: option(z.coerce.number().default(100), {
      description: "Baseline value for index comparison (default: 100)",
    }),
    baselineDesc: option(z.string().optional(), {
      description: "Description of what the baseline means",
    }),
    format: option(z.enum(["json", "table", "plain"]).default("plain"), {
      description: "Summary output format (data always written to --output)",
    }),
  },
  handler: async ({ positional, flags, signal }) => {
    if (signal.aborted) return;

    const excelArg = positional[0];
    if (!excelArg) {
      writeError("path to an Excel file is required", "MISSING_REQUIRED");
      process.exit(1);
    }

    const excelPath = resolve(excelArg);
    if (!existsSync(excelPath)) {
      writeError(`File not found: ${excelPath}`, "NOT_FOUND");
      process.exit(1);
    }

    const outputPath = flags.output
      ? resolve(flags.output)
      : resolve(process.cwd(), "salary_data.json");

    log(`Reading: ${excelPath}`);
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.readFile(excelPath, { cellDates: false });
    } catch (err) {
      writeError(err instanceof Error ? err.message : String(err), "PARSE_ERROR");
      process.exit(1);
    }

    const allCompanies: CompanyEntry[] = [];
    for (const sheetName of wb.SheetNames) {
      log(`  Parsing sheet: ${sheetName}`);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json<Row>(ws, {
        header: 1,
        defval: null,
        blankrows: false,
        raw: true,
      });
      allCompanies.push(...parseSheet(rows, sheetName));
    }

    if (allCompanies.length === 0) {
      writeError(
        "No data could be parsed. Ensure the sheet has a header row with a Company/Firma column.",
        "NO_DATA",
      );
      process.exit(1);
    }

    const stem = basename(excelPath, extname(excelPath));
    const output = {
      metadata: {
        source: flags.source ?? stem,
        index_baseline: flags.baseline,
        index_label: "Index",
        baseline_description: flags.baselineDesc ?? `Index ${flags.baseline} = baseline`,
      },
      companies: allCompanies,
    };

    writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");

    const summary = {
      wrote: allCompanies.length,
      output: outputPath,
      sheets: wb.SheetNames.length,
    };
    if (flags.format === "json") {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`Done! Wrote ${allCompanies.length} company entries to ${outputPath}`);
    }
  },
});
