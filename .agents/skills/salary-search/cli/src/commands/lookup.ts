import { defineCommand, option } from "@bunli/core";
import { z } from "zod";
import {
  formatEntry,
  loadData,
  MissingDataError,
  resolveDataFile,
  searchCompany,
  writeError,
  type CompanyEntry,
} from "../helpers.js";

function printMissingGuidance(path: string): void {
  process.stderr.write(`Error: salary data file not found: ${path}\n\n`);
  process.stderr.write("This tool requires a salary data file.\n");
  process.stderr.write(
    "See the salary-search README for setup instructions.\n\n",
  );
  process.stderr.write(
    "If you don't have salary data, the salary lookup step is skipped during /apply.\n",
  );
}

export const lookup = defineCommand({
  name: "lookup",
  description: "Look up a company's salary benchmark from your dataset",
  options: {
    city: option(z.string().optional(), {
      short: "c",
      description: "Filter by city name",
    }),
    data: option(z.string().optional(), {
      short: "d",
      description: "Path to salary_data.json (default: ./salary_data.json or $SALARY_DATA)",
    }),
    format: option(z.enum(["json", "table", "plain"]).default("table"), {
      description: "Output format: json, table, plain",
    }),
  },
  handler: async ({ positional, flags, signal }) => {
    if (signal.aborted) return;

    const dataFile = resolveDataFile(flags.data);
    let data;
    try {
      data = loadData(dataFile);
    } catch (err) {
      if (err instanceof MissingDataError) {
        printMissingGuidance(err.path);
        process.exit(1);
      }
      writeError(err instanceof Error ? err.message : String(err), "DATA_ERROR");
      process.exit(1);
    }

    const metadata = data.metadata ?? {};

    const company = positional[0];
    if (!company) {
      writeError("company name is required", "MISSING_REQUIRED");
      process.exit(1);
    }

    const results = searchCompany(data, company, flags.city);

    if (results.length === 0) {
      writeError(
        flags.city
          ? `No results found for '${company}' (city: ${flags.city})`
          : `No results found for '${company}'`,
        "NOT_FOUND",
      );
      process.exit(1);
    }

    if (flags.format === "json") {
      console.log(JSON.stringify(results, null, 2));
    } else if (flags.format === "table") {
      console.log(`\nFound ${results.length} match(es) for '${company}':`);
      for (const entry of results) {
        console.log(formatEntry(entry, metadata));
      }
      console.log("");
    } else {
      outputPlain(results);
    }
  },
});

export const list = defineCommand({
  name: "list",
  description: "List every company in the dataset",
  options: {
    data: option(z.string().optional(), {
      short: "d",
      description: "Path to salary_data.json (default: ./salary_data.json or $SALARY_DATA)",
    }),
    format: option(z.enum(["json", "plain"]).default("plain"), {
      description: "Output format: json, plain",
    }),
  },
  handler: async ({ flags, signal }) => {
    if (signal.aborted) return;

    const dataFile = resolveDataFile(flags.data);
    let data;
    try {
      data = loadData(dataFile);
    } catch (err) {
      if (err instanceof MissingDataError) {
        printMissingGuidance(err.path);
        process.exit(1);
      }
      writeError(err instanceof Error ? err.message : String(err), "DATA_ERROR");
      process.exit(1);
    }

    const companies = data.companies ?? [];
    if (flags.format === "json") {
      console.log(
        JSON.stringify(
          companies.map((e) => ({ company: e.company, city: e.city ?? null })),
          null,
          2,
        ),
      );
    } else {
      for (const entry of companies) {
        const city = entry.city ? ` (${entry.city})` : "";
        console.log(`${entry.company}${city}`);
      }
    }
  },
});

function outputPlain(results: CompanyEntry[]): void {
  for (const entry of results) {
    console.log(`company: ${entry.company}`);
    console.log(`city: ${entry.city ?? "-"}`);
    for (const [label, cat] of Object.entries(entry.categories ?? {})) {
      const count = cat.count ?? "-";
      const index = cat.index ?? "-";
      console.log(`  ${label}: count=${count} index=${index}`);
    }
    console.log("");
  }
}
