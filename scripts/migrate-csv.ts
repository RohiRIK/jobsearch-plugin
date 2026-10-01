#!/usr/bin/env bun
/**
 * One-time CSV → SQLite migration script.
 * Reads job_search_tracker.csv and imports rows into tracker.db.
 * Invalid rows are logged to import-errors.log (partial success).
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { WORKSPACE } from "../src/paths.js";
import { Tracker } from "../src/tracker.js";
import { JobApplicationCreate } from "../src/schemas.js";

const CSV_PATH = join(WORKSPACE, "job_search_tracker.csv");
const ERROR_LOG = join(WORKSPACE, "data", "import-errors.log");

interface CsvRow {
  date: string;
  company: string;
  sector: string;
  role: string;
  role_type: string;
  channel: string;
  status: string;
  contact_person: string;
  fit_rating: string;
  notes: string;
  cv_file: string;
  cover_letter_file: string;
  source: string;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row as unknown as CsvRow);
  }

  return rows;
}

function validateRow(row: CsvRow, index: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!row.company?.trim()) errors.push("missing company");
  if (!row.role?.trim()) errors.push("missing role");
  if (row.status && !["planning", "applied", "interviewing", "offered", "rejected", "withdrawn", "no_response"].includes(row.status)) {
    errors.push(`invalid status: ${row.status}`);
  }
  if (row.fit_rating && row.fit_rating !== "") {
    const num = Number(row.fit_rating);
    if (isNaN(num) || num < 0 || num > 100 || !Number.isInteger(num)) {
      errors.push(`invalid fit_rating: ${row.fit_rating}`);
    }
  }
  if (row.source && row.source !== "") {
    try {
      new URL(row.source);
    } catch {
      errors.push(`invalid source URL: ${row.source}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function main(): void {
  if (!existsSync(CSV_PATH)) {
    console.log("No job_search_tracker.csv found — nothing to migrate.");
    process.exit(0);
  }

  const content = readFileSync(CSV_PATH, "utf-8");
  const rows = parseCsv(content);

  if (rows.length === 0) {
    console.log("CSV is empty — nothing to migrate.");
    process.exit(0);
  }

  console.log(`Found ${rows.length} rows in CSV`);

  const tracker = new Tracker();
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const validation = validateRow(row, i + 2);

    if (!validation.valid) {
      const msg = `Row ${i + 2} (${row.company || "unknown"}): ${validation.errors.join(", ")}`;
      errors.push(msg);
      console.error(`  SKIP: ${msg}`);
      skipped++;
      continue;
    }

    try {
      const data: JobApplicationCreate = {
        id: "", // auto-generated
        date: row.date || new Date().toISOString().slice(0, 10),
        company: row.company.trim(),
        sector: row.sector?.trim() || undefined,
        role: row.role.trim(),
        role_type: (row.role_type?.trim() as JobApplicationCreate["role_type"]) || undefined,
        channel: row.channel?.trim() || undefined,
        status: (row.status?.trim() as JobApplicationCreate["status"]) || "planning",
        contact_person: row.contact_person?.trim() || undefined,
        fit_rating: row.fit_rating && row.fit_rating !== "" ? Number(row.fit_rating) : undefined,
        notes: row.notes?.trim() || undefined,
        cv_file: row.cv_file?.trim() || undefined,
        cover_letter_file: row.cover_letter_file?.trim() || undefined,
        source: row.source?.trim() || undefined,
      };

      const result = tracker.insert(data);
      if (result) {
        imported++;
        console.log(`  OK: ${result.id} — ${result.company} / ${result.role}`);
      } else {
        skipped++;
        console.log(`  SKIP: ${row.company} / ${row.role} — duplicate (same content_hash)`);
      }
    } catch (err) {
      const msg = `Row ${i + 2} (${row.company}): ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      console.error(`  ERROR: ${msg}`);
      skipped++;
    }
  }

  tracker.close();

  // Write error log if there were issues
  if (errors.length > 0) {
    writeFileSync(ERROR_LOG, errors.join("\n") + "\n");
    console.log(`\n${errors.length} errors logged to import-errors.log`);
  }

  console.log(`\nMigration complete: ${imported} imported, ${skipped} skipped`);
}

main();
