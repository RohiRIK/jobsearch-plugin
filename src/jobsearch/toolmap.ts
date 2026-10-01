/**
 * The single-purpose CLIs `jobsearch` can run, keyed by their `bun run`
 * script name — so a checkout's `bun run markets show de` is
 * `jobsearch run markets show de` anywhere the plugin is installed.
 *
 * `writes: true` tools change user state with their own semantics (no shared
 * --dry-run); skills must get a human yes before running them.
 */
export interface ToolDef {
  source: string;
  /** Arguments prepended before the caller's (e.g. pipeline:scrape → ["scrape"]). */
  prefix?: string[];
  writes?: boolean;
  summary: string;
}

export const TOOL_MAP: Record<string, ToolDef> = {
  application: { source: "scripts/generate/application.ts", summary: "prepare | review | render an evidence-grounded application" },
  reevaluate: { source: "scripts/reevaluate.ts", summary: "the shipping gate (full report)" },
  pipeline: { source: "scripts/pipeline/cli.ts", writes: true, summary: "orchestrated pipeline steps" },
  "pipeline:scrape": { source: "scripts/pipeline/cli.ts", prefix: ["scrape"], summary: "portal scrape (updates seen-jobs)" },
  "pipeline:weekly": { source: "scripts/pipeline/cli.ts", prefix: ["weekly"], writes: true, summary: "weekly report" },
  "pipeline:reason": { source: "scripts/pipeline/cli.ts", prefix: ["reason"], writes: true, summary: "reasoning analysis step" },
  markets: { source: "scripts/markets.ts", summary: "CV conventions per country: table | show <code> | detect --job f" },
  summarize: { source: "scripts/jobs/summarize.ts", summary: "posting → structured JSON" },
  score: { source: "scripts/match/score-job.ts", summary: "0-100 fit score (full detail)" },
  "select-template": { source: "scripts/select-template.ts", summary: "template ranking with per-factor rationale" },
  naming: { source: "scripts/naming.ts", summary: "show | check document naming" },
  followup: { source: "scripts/followup.ts", writes: true, summary: "pending | mark <id>" },
  "interview-prep": { source: "scripts/jobs/interview-prep.ts", summary: "interview prep sheet" },
  outcome: { source: "scripts/profile/outcome.ts", writes: true, summary: "record an application outcome" },
  reason: { source: "scripts/profile/reason.ts", writes: true, summary: "reasoning log: add | list | analyze" },
  feedback: { source: "scripts/profile/feedback.ts", writes: true, summary: "profile suggestions from outcomes (--apply writes)" },
  "profile:scaffold": { source: "scripts/profile/scaffold.ts", writes: true, summary: "create a profile skeleton" },
  "profile:check": { source: "scripts/profile/scaffold.ts", prefix: ["--check"], summary: "validate the profile" },
  projects: { source: "scripts/projects.ts", writes: true, summary: "portfolio projects: list | match | approve | restrict" },
  market: { source: "scripts/jobs/market.ts", summary: "demand snapshot from scraped jobs (--save writes)" },
  trajectory: { source: "scripts/jobs/trajectory.ts", summary: "skill-demand trend across snapshots" },
  alerts: { source: "scripts/jobs/alerts.ts", writes: true, summary: "unreviewed scraped jobs: list | mark" },
  email: { source: "scripts/generate/email.ts", summary: "follow-up / thank-you / withdrawal email drafts" },
  "cover-letter": { source: "scripts/generate/cover-letter.ts", writes: true, summary: "heuristic cover letter fallback" },
  dashboard: { source: "scripts/dashboard.ts", summary: "tracker dashboard data" },
  doctor: { source: "scripts/doctor.ts", summary: "toolchain check" },
};
