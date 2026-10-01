/**
 * Document Naming Convention
 *
 * Enforces: <Name>_<Company>_<Role>_CV.pdf and _CL.pdf
 * Reads name from data/config.json or defaults to "Candidate".
 *
 * Usage:
 *   import { buildOutputName, buildOutputPath } from "./naming.js";
 *   const cvPath = buildOutputPath("cv", "Acme", "ML Engineer");
 *   // → "assets/cv/Acme_ML-Engineer_CV.pdf" (if no name configured)
 *   // → "assets/cv/Jane-Doe_Acme_ML-Engineer_CV.pdf" (if name is "Jane-Doe")
 */

import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from "fs";
import { resolve, join, extname } from "path";
import { WORKSPACE } from "./paths.js";

const CONFIG_PATH = join(WORKSPACE, "data", "config.json");

/** Recursively list files with one of the given extensions under an absolute dir. */
export function walkDocuments(absDir: string, exts: Set<string>): string[] {
  if (!existsSync(absDir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(absDir)) {
    const full = join(absDir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkDocuments(full, exts));
    } else if (exts.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface DocConfig {
  /** Candidate name for file naming (e.g. "Jane-Doe"). Empty = omit from filename. */
  name: string;
  /** Root for grouped application output: <applicationsDir>/<Company>/<Date>/. */
  applicationsDir: string;
  /** Legacy flat CV directory — kept for reading older files; new output goes to applicationsDir. */
  cvDir: string;
  /** Legacy flat cover-letter directory — kept for reading older files. */
  coverDir: string;
  /** File extension for source files. */
  sourceExt: "typ" | "tex";
  /** Separator for multi-word fields in filenames. */
  fieldSeparator: string;
  /** Within-field word separator (spaces → this). */
  wordSeparator: string;
}

const DEFAULT_CONFIG: DocConfig = {
  name: "",
  applicationsDir: "assets/applications",
  cvDir: "assets/cv",
  coverDir: "assets/cover_letters",
  sourceExt: "typ",
  fieldSeparator: "_",
  wordSeparator: "-",
};

/** Today in YYYY-MM-DD (generation date used for the application folder). */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Grouped output directory for one application: <applicationsDir>/<Company>/<Date>/. */
export function applicationDir(company: string, config?: DocConfig, date?: string): string {
  const cfg = config || loadConfig();
  return join(cfg.applicationsDir, slugify(company, cfg.wordSeparator), date ?? today());
}

export function loadConfig(): DocConfig {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Partial<DocConfig>): void {
  const current = loadConfig();
  const merged = { ...current, ...config };
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n");
}

/** Name owned by the active profile, not by the repository's global config. */
export function profileDocumentName(identity: { name?: string | null; firstName?: string | null; lastName?: string | null }): string {
  const explicit = [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim();
  return explicit || identity.name?.trim() || "";
}

export function documentNameSlug(name: string, config?: DocConfig): string {
  return slugify(name, (config || loadConfig()).wordSeparator);
}

// ─── Slugify ──────────────────────────────────────────────────────────────────

function slugify(input: string, wordSep: string): string {
  return input
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, "") // strip special chars
    .replace(/\s+/g, wordSep) // spaces → separator
    .replace(/-+/g, wordSep) // hyphens → separator
    .replace(new RegExp(`^${wordSep}+|${wordSep}+$`, "g"), ""); // trim
}

// ─── Name Builder ────────────────────────────────────────────────────────────

export function buildOutputName(
  docType: "cv" | "cl",
  company: string,
  role: string,
  config?: DocConfig
): string {
  const cfg = config || loadConfig();
  const parts: string[] = [];

  // Name prefix (if configured)
  if (cfg.name) {
    parts.push(slugify(cfg.name, cfg.wordSeparator));
  }

  // Company
  parts.push(slugify(company, cfg.wordSeparator));

  // Role
  parts.push(slugify(role, cfg.wordSeparator));

  // Document type suffix
  parts.push(docType.toUpperCase());

  return parts.join(cfg.fieldSeparator);
}

export function buildOutputPath(
  docType: "cv" | "cl",
  company: string,
  role: string,
  config?: DocConfig,
  date?: string
): string {
  const cfg = config || loadConfig();
  const name = buildOutputName(docType, company, role, cfg);
  return join(applicationDir(company, cfg, date), `${name}.pdf`);
}

export function buildSourcePath(
  docType: "cv" | "cl",
  company: string,
  role: string,
  config?: DocConfig,
  date?: string
): string {
  const cfg = config || loadConfig();
  const name = buildOutputName(docType, company, role, cfg);
  return join(applicationDir(company, cfg, date), `${name}.${cfg.sourceExt}`);
}

// ─── Parse (reverse — extract company/role from filename) ────────────────────

export function parseFileName(
  fileName: string,
  config?: DocConfig
): { name?: string; company: string; role: string; docType: "cv" | "cl" } | null {
  const cfg = config || loadConfig();
  const base = fileName.replace(/\.(pdf|typ|tex)$/i, "");
  const parts = base.split(cfg.fieldSeparator);

  // Last part is CV or CL
  let docType: "cv" | "cl";
  const last = parts[parts.length - 1]?.toUpperCase();
  if (last === "CV") docType = "cv";
  else if (last === "CL") docType = "cl";
  else return null;

  const remaining = parts.slice(0, -1);

  // If name is configured, strip it from front
  let name: string | undefined;
  if (cfg.name) {
    const nameSlug = slugify(cfg.name, cfg.wordSeparator);
    if (remaining[0] === nameSlug) {
      name = cfg.name;
      remaining.shift();
    }
  }

  // remaining = [company, role] — but role may have multiple words joined by wordSep
  // Without more info, assume first element is company, rest is role
  if (remaining.length < 2) return null;

  const company = remaining[0].replace(new RegExp(cfg.wordSeparator, "g"), " ");
  const role = remaining.slice(1).join(" ").replace(new RegExp(cfg.wordSeparator, "g"), " ");

  return { name, company, role, docType };
}
