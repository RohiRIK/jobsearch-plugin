#!/usr/bin/env bun
/**
 * Job Application Tracker CLI
 *
 * Usage:
 *   bun run scripts/tracker.ts list [--status <status>] [--company <name>]
 *   bun run scripts/tracker.ts get <id>
 *   bun run scripts/tracker.ts add --company <name> --role <role> [--status <status>] [--source <url>]
 *   bun run scripts/tracker.ts update <id> [--status <status>] [--notes <text>]
 *   bun run scripts/tracker.ts delete <id>
 *   bun run scripts/tracker.ts stats
 *   bun run scripts/tracker.ts export [--format csv]
 */

import { parseArgs } from "util";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { Tracker, closeTracker } from "../src/tracker.js";
import { ApplicationStatus } from "../src/schemas.js";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    status: { type: "string", short: "s" },
    company: { type: "string", short: "c" },
    role: { type: "string", short: "r" },
    source: { type: "string" },
    notes: { type: "string", short: "n" },
    fit: { type: "string", short: "f" },
    format: { type: "string", default: "csv" },
    template: { type: "string" },
    language: { type: "string" },
    outcome: { type: "string" },
    "app-id": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

const command = positionals[0] as string;
const tracker = new Tracker();

function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log("  (empty)");
    return;
  }
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) => k.length);
  for (const row of rows) {
    keys.forEach((k, i) => {
      const val = String(row[k] ?? "");
      widths[i] = Math.max(widths[i], Math.min(val.length, 40));
    });
  }
  const header = keys.map((k, i) => k.padEnd(widths[i])).join("  ");
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  console.log(`  ${header}`);
  console.log(`  ${sep}`);
  for (const row of rows) {
    const line = keys
      .map((k, i) => {
        const val = String(row[k] ?? "");
        return val.length > 40 ? val.slice(0, 37) + "..." : val.padEnd(widths[i]);
      })
      .join("  ");
    console.log(`  ${line}`);
  }
}

try {
  switch (command) {
    case "list": {
      const rows = tracker.list({
        status: values.status as string | undefined,
        company: values.company as string | undefined,
      });
      console.log(`\nApplications (${rows.length}):\n`);
      printTable(
        rows.map((r) => ({
          id: r.id,
          date: r.date,
          company: r.company,
          role: r.role,
          status: r.status,
          fit: r.fit_rating ?? "",
        }))
      );
      break;
    }

    case "get": {
      const id = positionals[1];
      if (!id) {
        console.error("Usage: tracker get <id>");
        process.exit(1);
      }
      const app = tracker.get(id);
      if (!app) {
        console.error(`Not found: ${id}`);
        process.exit(1);
      }
      console.log(JSON.stringify(app, null, 2));
      break;
    }

    case "add": {
      if (!values.company || !values.role) {
        console.error("Usage: tracker add --company <name> --role <role>");
        process.exit(1);
      }
      const result = tracker.insert({
        id: "",
        date: new Date().toISOString().slice(0, 10),
        company: values.company as string,
        role: values.role as string,
        status: ((values.status as string) || "planning") as any,
        source: values.source as string | undefined,
        notes: values.notes as string | undefined,
        fit_rating: values.fit ? Number(values.fit) : undefined,
      });
      console.log(`Added: ${result.id} — ${result.company} / ${result.role}`);
      break;
    }

    case "update": {
      const id = positionals[1];
      if (!id) {
        console.error("Usage: tracker update <id> [--status <status>] [--notes <text>]");
        process.exit(1);
      }
      const changes: Record<string, unknown> = {};
      if (values.status) changes.status = values.status as string;
      if (values.notes) changes.notes = values.notes as string;
      if (values.fit) changes.fit_rating = Number(values.fit);
      if (values.company) changes.company = values.company as string;
      if (values.role) changes.role = values.role as string;

      const result = tracker.update(id, changes);
      if (!result) {
        console.error(`Not found: ${id}`);
        process.exit(1);
      }
      console.log(`Updated: ${result.id} — ${result.company} / ${result.role} [${result.status}]`);
      break;
    }

    case "delete": {
      const id = positionals[1];
      if (!id) {
        console.error("Usage: tracker delete <id>");
        process.exit(1);
      }
      const ok = tracker.delete(id);
      if (!ok) {
        console.error(`Not found: ${id}`);
        process.exit(1);
      }
      console.log(`Deleted: ${id}`);
      break;
    }

    case "stats": {
      const stats = tracker.stats();
      console.log(`\nTotal applications: ${stats.total}\n`);
      if (Object.keys(stats.by_status).length > 0) {
        console.log("By status:");
        for (const [status, count] of Object.entries(stats.by_status)) {
          console.log(`  ${status}: ${count}`);
        }
      }
      if (Object.keys(stats.by_company).length > 0) {
        console.log("\nBy company:");
        for (const [company, count] of Object.entries(stats.by_company)) {
          console.log(`  ${company}: ${count}`);
        }
      }
      break;
    }

    case "export": {
      const rows = tracker.list();
      if (values.format === "csv") {
        const headers = [
          "date", "company", "sector", "role", "role_type", "channel",
          "status", "contact_person", "fit_rating", "notes", "cv_file",
          "cover_letter_file", "source",
        ];
        const lines = [headers.join(",")];
        for (const row of rows) {
          const values = headers.map((h) => {
            const val = String(row[h as keyof typeof row] ?? "");
            return val.includes(",") || val.includes('"') || val.includes("\n")
              ? `"${val.replace(/"/g, '""')}"`
              : val;
          });
          lines.push(values.join(","));
        }
        const outPath = resolve(process.cwd(), "job_search_tracker.csv");
        writeFileSync(outPath, lines.join("\n") + "\n");
        console.log(`Exported ${rows.length} rows to ${outPath}`);
      } else {
        console.log(JSON.stringify(rows, null, 2));
      }
      break;
    }

    case "versions": {
      const rows = tracker.listDocumentVersions({
        template: values.template as string | undefined,
        company: values.company as string | undefined,
        outcome: values.outcome as string | undefined,
      });
      printTable(rows as unknown as Record<string, unknown>[]);
      break;
    }

    case "version-add": {
      const filePath = positionals[1];
      if (!filePath) {
        console.error("Usage: tracker version-add <file-path> [--template <t>] [--company <c>] [--role <r>] [--app-id <id>]");
        process.exit(1);
      }
      const version = tracker.addDocumentVersion({
        file_path: filePath,
        template_used: values.template as string | undefined,
        language: values.language as string | undefined,
        company: values.company as string | undefined,
        role: values.role as string | undefined,
        application_id: values["app-id"] as string | undefined,
      });
      console.log(JSON.stringify(version, null, 2));
      break;
    }

    default:
      console.log(`
Job Application Tracker CLI

Commands:
  list [--status <s>] [--company <c>]   List applications
  get <id>                               Get single application
  add --company <c> --role <r> [opts]    Add new application
  update <id> [opts]                     Update application
  delete <id>                            Delete application
  stats                                  Show summary statistics
  export [--format csv]                  Export to CSV or JSON
  versions [--template <t>] [--company <c>] [--outcome <status>]
                                         List document versions
  version-add <file> [opts]              Record a document version

Options:
  --status, -s    Filter by status
  --company, -c   Filter by company name
  --role, -r      Role title (for add)
  --source        Source URL (for add)
  --notes, -n     Notes (for add/update)
  --fit, -f       Fit rating 0-100 (for add/update)
  --format        Export format: csv (default) or json
      `);
  }
} finally {
  closeTracker();
}
