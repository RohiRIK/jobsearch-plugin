import { z } from "zod";

// ─── Job Application Tracker ─────────────────────────────────────────────────

export const ApplicationStatus = z.enum([
  "planning",
  "applied",
  "interviewing",
  "offered",
  "rejected",
  "withdrawn",
  "no_response",
]);

export type ApplicationStatus = z.infer<typeof ApplicationStatus>;

export const JobApplication = z.object({
  id: z.string().regex(/^app_\d{8}_[a-z0-9-]+$/, "Format: app_YYYYMMDD_<company_slug>"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  company: z.string().min(1),
  sector: z.string().optional(),
  role: z.string().min(1),
  role_type: z.enum(["full-time", "part-time", "contract", "internship", "freelance"]).optional(),
  channel: z.string().optional(),
  status: ApplicationStatus,
  contact_person: z.string().optional(),
  fit_rating: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().optional(),
  cv_file: z.string().optional(),
  cover_letter_file: z.string().optional(),
  source: z.string().url().optional().nullable(),
  content_hash: z.string().optional(),
  template_used: z.string().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type JobApplication = z.infer<typeof JobApplication>;

export const JobApplicationCreate = JobApplication.omit({
  created_at: true,
  updated_at: true,
});

export type JobApplicationCreate = z.infer<typeof JobApplicationCreate>;

// ─── Seen Jobs (Scraper Dedup) ──────────────────────────────────────────────

export const SeenJobEntry = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  market: z.enum(["il", "dk", "us", "eu", "remote"]),
  url: z.string().url(),
  first_seen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  last_seen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source_portal: z.string().optional(),
  content_hash: z.string().optional(),
  description: z.string().max(50_000).optional(),
  fit: z.enum(["high", "medium", "low"]),
  status: z.enum(["new", "skipped", "evaluated", "ranked", "expired"]),
});

export type SeenJobEntry = z.infer<typeof SeenJobEntry>;

export const SeenJobsFile = z.object({
  seen: z.record(z.string(), SeenJobEntry),
});

export type SeenJobsFile = z.infer<typeof SeenJobsFile>;

// ─── Compile Result ─────────────────────────────────────────────────────────

export const CompileEngine = z.enum(["typst", "lualatex", "xelatex"]);

export type CompileEngine = z.infer<typeof CompileEngine>;

export const CompileStatus = z.enum(["success", "failed", "skipped"]);

export type CompileStatus = z.infer<typeof CompileStatus>;

export const CompileResult = z.object({
  file: z.string(),
  engine: CompileEngine,
  pages: z.number().int().positive().nullable(),
  expected_pages: z.number().int().positive().nullable(),
  status: CompileStatus,
  ats_check: z.enum(["pass", "fail", "skipped", "unavailable"]).optional(),
  error: z.string().optional(),
  /** Set when the compiler itself is absent: a toolchain problem, not a source error. */
  missingTool: z.string().optional(),
  duration_ms: z.number().optional(),
});

export type CompileResult = z.infer<typeof CompileResult>;

// ─── Template Metadata ──────────────────────────────────────────────────────

export const TemplateFormality = z.enum(["formal", "semi-formal", "casual"]);
export const TemplateStyle = z.enum(["conservative", "modern", "creative"]);
export const TemplateEngine = z.enum(["typst", "latex"]);

export const AssetPhotoConfig = z.object({
  required: z.boolean(),
  position: z.enum(["top-left", "top-right", "left-sidebar", "none"]),
  size: z.string(),
});

export const AssetIconsConfig = z.object({
  required: z.boolean(),
  style: z.enum(["font-awesome", "custom-svg", "none"]),
});

export const AssetLogoConfig = z.object({
  required: z.boolean(),
  position: z.enum(["header", "sidebar", "none"]),
});

export const AssetSignatureConfig = z.object({
  required: z.boolean(),
});

export const AssetConfig = z.object({
  photo: AssetPhotoConfig.optional(),
  icons: AssetIconsConfig.optional(),
  logo: AssetLogoConfig.optional(),
  signature: AssetSignatureConfig.optional(),
});

export type AssetConfig = z.infer<typeof AssetConfig>;

export const TemplateMeta = z.object({
  name: z.string(),
  engine: TemplateEngine,
  source: z.string(),
  formality: TemplateFormality,
  sectors: z.array(z.string()),
  markets: z.array(z.string()),
  style: TemplateStyle,
  pages: z.number().int().positive(),
  features: z.array(z.string()),
  description: z.string(),
  assets: AssetConfig.optional(),
});

export type TemplateMeta = z.infer<typeof TemplateMeta>;

// ─── Build Config ───────────────────────────────────────────────────────────

export const BuildConfig = z.object({
  input: z.string(),
  output: z.string().optional(),
  format: z.enum(["pdf", "docx", "both"]).default("pdf"),
  verify: z.boolean().default(false),
  all: z.boolean().default(false),
  template: z.string().optional(),
});

export type BuildConfig = z.infer<typeof BuildConfig>;

// ─── Helpers ────────────────────────────────────────────────────────────────

export function generateApplicationId(company: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const slug = company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `app_${date}_${slug}`;
}

export function computeContentHash(title: string, company: string, location: string): string {
  const data = `${title.toLowerCase().trim()}|${company.toLowerCase().trim()}|${location.toLowerCase().trim()}`;
  // Simple hash — not cryptographic, but deterministic and sufficient for dedup
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}
