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
  /**
   * Every long flag the tool accepts (without `--`); `help` is implied. The
   * tools entry rejects anything else before the tool runs, so a mistyped flag
   * can never be dropped silently (jobsearch-plugin#17).
   */
  flags: string[];
  /** Accepted single-letter flags besides -h, e.g. ["i"] for -i. */
  short?: string[];
}

export const TOOL_MAP: Record<string, ToolDef> = {
  application: { source: "scripts/generate/application.ts", summary: "prepare | review | render an evidence-grounded application", flags: ["cl-template","company","compile","cv-template","date","draft","fit","force","interests","job","language","layout","links","market","profile","role"] },
  reevaluate: { source: "scripts/reevaluate.ts", summary: "the shipping gate (full report)", flags: ["allow-missing-ats","company","file","market","profile","role","type"] },
  pipeline: { source: "scripts/pipeline/cli.ts", writes: true, summary: "orchestrated pipeline steps", flags: ["resume","skip-github","job","title","company","query","portals"] },
  "pipeline:scrape": { source: "scripts/pipeline/cli.ts", prefix: ["scrape"], summary: "portal scrape (updates seen-jobs)", flags: ["resume","skip-github","job","title","company","query","portals"] },
  "pipeline:weekly": { source: "scripts/pipeline/cli.ts", prefix: ["weekly"], writes: true, summary: "weekly report", flags: ["resume","skip-github","job","title","company","query","portals"] },
  "pipeline:reason": { source: "scripts/pipeline/cli.ts", prefix: ["reason"], writes: true, summary: "reasoning analysis step", flags: ["resume","skip-github","job","title","company","query","portals"] },
  markets: { source: "scripts/markets.ts", summary: "CV conventions per country: table | show <code> | detect --job f", flags: ["job","json"] },
  summarize: { source: "scripts/jobs/summarize.ts", summary: "posting → structured JSON", flags: ["input","title","company","location"], short: ["i"] },
  score: { source: "scripts/match/score-job.ts", summary: "0-100 fit score (full detail)", flags: ["input","title","company","location","save","profile"], short: ["i"] },
  "select-template": { source: "scripts/select-template.ts", summary: "template ranking with per-factor rationale", flags: ["format","include-stubs","job","list","profile","template"] },
  naming: { source: "scripts/naming.ts", summary: "show | check document naming", flags: [] },
  followup: { source: "scripts/followup.ts", writes: true, summary: "pending | mark <id>", flags: ["days"] },
  "interview-prep": { source: "scripts/jobs/interview-prep.ts", summary: "interview prep sheet", flags: ["company","format","job","profile","role"] },
  outcome: { source: "scripts/profile/outcome.ts", writes: true, summary: "record an application outcome", flags: ["version","status","reason","response-days","interviews","notes","template","cover-letter","channel","from"], short: ["v"] },
  reason: { source: "scripts/profile/reason.ts", writes: true, summary: "reasoning log: add | list | analyze", flags: ["version","type","finding","evidence","confidence","action"], short: ["v"] },
  feedback: { source: "scripts/profile/feedback.ts", writes: true, summary: "profile suggestions from outcomes (--apply writes)", flags: ["version","apply"], short: ["v"] },
  "profile:scaffold": { source: "scripts/profile/scaffold.ts", writes: true, summary: "create a profile skeleton", flags: ["check","force","output","print"] },
  "profile:check": { source: "scripts/profile/scaffold.ts", prefix: ["--check"], summary: "validate the profile", flags: ["check","force","output","print"] },
  projects: { source: "scripts/projects.ts", writes: true, summary: "portfolio projects: list | match | approve | restrict", flags: ["dry-run","job","json","limit","replace-from-blog"] },
  market: { source: "scripts/jobs/market.ts", summary: "demand snapshot from scraped jobs (--save writes)", flags: ["format","input","save"] },
  trajectory: { source: "scripts/jobs/trajectory.ts", summary: "skill-demand trend across snapshots", flags: ["dir","format","save","top"] },
  alerts: { source: "scripts/jobs/alerts.ts", writes: true, summary: "unreviewed scraped jobs: list | mark", flags: ["fit","format","input","market","since","status"] },
  email: { source: "scripts/generate/email.ts", summary: "follow-up / thank-you / withdrawal email drafts", flags: ["company","contact","format","id","profile","role","type"] },
  "cover-letter": { source: "scripts/generate/cover-letter.ts", writes: true, summary: "heuristic cover letter fallback", flags: ["company","compile","job","out","profile","recipient","role","template"] },
  dashboard: { source: "scripts/dashboard.ts", summary: "tracker dashboard data", flags: ["format"] },
  doctor: { source: "scripts/doctor.ts", summary: "toolchain check", flags: ["format"] },
};
