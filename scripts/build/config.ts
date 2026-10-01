/**
 * Build CLI Configuration
 *
 * Loads from .env and data/config.json.
 * Defaults applied for all optional settings.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { loadConfig, DocConfig } from "../../src/naming.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";


// ─── Build Config ───────────────────────────────────────────────────────────

export interface BuildConfig {
  /** Project root directory. */
  root: string;
  /** Naming config (name, dirs, separators). */
  naming: DocConfig;
  /** Directories to scan for source files. */
  sourceDirs: readonly string[];
  /** Valid source extensions. */
  sourceExts: readonly string[];
  /** Page expectations: docType → expected page count. */
  pageExpectations: Record<string, number>;
  /** Pipeline steps enabled. */
  pipeline: PipelineConfig;
}

// ─── Pipeline Config ────────────────────────────────────────────────────────

export interface PipelineConfig {
  /** Step 1: Parse job description. */
  jdParse: boolean;
  /** Step 2: Score fit against candidate profile. */
  fitScore: boolean;
  /** Step 3: Identify skill gaps. */
  gapAnalysis: boolean;
  /** Step 4: Generate documents (CV + cover letter). */
  generate: boolean;
  /** Step 5: Verify output (page count, ATS, spelling). */
  verify: boolean;
}

const DEFAULT_PIPELINE: PipelineConfig = {
  jdParse: true,
  fitScore: true,
  gapAnalysis: true,
  generate: true,
  verify: true,
};

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULTS = {
  sourceExts: [".typ", ".tex"],
  pageExpectations: { cv: 2, cl: 1 },
} as const;

// ─── Env Loading ────────────────────────────────────────────────────────────

function loadEnvValue(key: string): string | undefined {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return undefined;

  const content = readFileSync(envPath, "utf-8");
  const line = content.split("\n").find((l) => l.startsWith(`${key}=`));
  return line?.split("=")?.[1]?.trim();
}

// ─── Config Loader ──────────────────────────────────────────────────────────

export function loadBuildConfig(): BuildConfig {
  const naming = loadConfig();

  // Pipeline overrides from .env
  const pipelineEnv = loadEnvValue("BUILD_PIPELINE");
  let pipeline = { ...DEFAULT_PIPELINE };
  if (pipelineEnv === "minimal") {
    pipeline = { ...DEFAULT_PIPELINE, fitScore: false, gapAnalysis: false };
  } else if (pipelineEnv === "generate-only") {
    pipeline = {
      jdParse: false,
      fitScore: false,
      gapAnalysis: false,
      generate: true,
      verify: true,
    };
  }

  return {
    root: ROOT,
    naming,
    sourceDirs: [naming.cvDir, naming.coverDir],
    sourceExts: DEFAULTS.sourceExts,
    pageExpectations: DEFAULTS.pageExpectations,
    pipeline,
  };
}
