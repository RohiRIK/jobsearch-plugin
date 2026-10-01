#!/usr/bin/env bun
/**
 * Template Library Management CLI
 *
 * Usage:
 *   bun run scripts/templates.ts list              List all templates
 *   bun run scripts/templates.ts info <name>       Show template metadata
 *   bun run scripts/templates.ts match --job <file>  Score templates against a posting
 */

import { parseArgs } from "util";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { TemplateMeta } from "../src/schemas.js";
import { CODE_ROOT } from "../src/paths.js";

const TEMPLATES_DIR = join(CODE_ROOT, "templates");

// ─── Load Templates ─────────────────────────────────────────────────────────

function loadAllTemplates(): { cv: TemplateMeta[]; cover: TemplateMeta[] } {
  const cv: TemplateMeta[] = [];
  const cover: TemplateMeta[] = [];

  for (const type of ["cv", "cover"] as const) {
    const dir = join(TEMPLATES_DIR, type);
    if (!existsSync(dir)) continue;

    const subdirs = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const sub of subdirs) {
      const metaPath = join(dir, sub.name, "meta.json");
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
          const parsed = TemplateMeta.parse(meta);
          const sourcePath = join(dir, sub.name, parsed.source);
          if (!existsSync(sourcePath)) {
            process.stderr.write(`Warning: ${type}/${sub.name} is a metadata-only stub (missing ${parsed.source})\n`);
            continue;
          }
          if (type === "cv") cv.push(parsed);
          else cover.push(parsed);
        } catch (e) {
          console.error(`Warning: Invalid meta.json in ${type}/${sub.name}: ${e}`);
        }
      }
    }
  }

  return { cv, cover };
}

function findTemplate(name: string): TemplateMeta | null {
  const { cv, cover } = loadAllTemplates();
  return [...cv, ...cover].find((t) => t.name === name) || null;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h" },
  },
  strict: true,
  allowPositionals: true,
});

if (values.help) {
  console.log(`
Template Library CLI

Commands:
  list                    List all templates with metadata
  info <name>             Show full metadata for a template
  `);
  process.exit(0);
}

const command = positionals[0];

switch (command) {
  case "list": {
    const { cv, cover } = loadAllTemplates();

    console.log("\nCV Templates:\n");
    console.log(
      "  " +
        ["Name", "Formality", "Sectors", "Markets", "Style", "Pages"]
          .map((h) => h.padEnd(15))
          .join("  ")
    );
    console.log("  " + "-".repeat(100));
    for (const t of cv) {
      console.log(
        "  " +
          [
            t.name.padEnd(15),
            t.formality.padEnd(15),
            t.sectors.slice(0, 3).join(", ").padEnd(15),
            t.markets.join(", ").padEnd(15),
            t.style.padEnd(15),
            String(t.pages).padEnd(15),
          ].join("  ")
      );
    }

    console.log("\nCover Letter Templates:\n");
    console.log(
      "  " +
        ["Name", "Formality", "Sectors", "Markets", "Style", "Pages"]
          .map((h) => h.padEnd(15))
          .join("  ")
    );
    console.log("  " + "-".repeat(100));
    for (const t of cover) {
      console.log(
        "  " +
          [
            t.name.padEnd(15),
            t.formality.padEnd(15),
            t.sectors.slice(0, 3).join(", ").padEnd(15),
            t.markets.join(", ").padEnd(15),
            t.style.padEnd(15),
            String(t.pages).padEnd(15),
          ].join("  ")
      );
    }
    break;
  }

  case "info": {
    const name = positionals[1];
    if (!name) {
      console.error("Usage: templates info <name>");
      process.exit(1);
    }
    const template = findTemplate(name);
    if (!template) {
      console.error(`Template not found: ${name}`);
      process.exit(1);
    }
    console.log(JSON.stringify(template, null, 2));
    break;
  }

  default:
    console.log(`
Template Library CLI

Commands:
  list                    List all templates with metadata
  info <name>             Show full metadata for a template
    `);
}
