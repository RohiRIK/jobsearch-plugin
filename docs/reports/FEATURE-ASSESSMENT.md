# Feature Assessment — Scored Ranking

Scoring: Impact 40% · Feasibility 25% · Effort 20% (inverse: 5 = hours, 1 = weeks) · Integration 15%.
Grounding: assessed after full codebase read. Stack constraint: TS/Bun, zod, bun:sqlite, typst — no new dependencies for Phase 1.

## Phase 1: CLI Tools

| # | Feature | Impact | Feasibility | Effort | Integration | Weighted | Rank |
|---|---------|--------|-------------|--------|-------------|----------|------|
| 25 | JD Summarizer (heuristic) | 4 | 5 | 4 | 5 | 4.40 | **1** |
| 2 | Job Match Auto-Scorer | 5 | 4 | 4 | 5 | 4.55 | **2** |
| 5 | Pipeline Dashboard | 4 | 5 | 4 | 5 | 4.40 | **3** |
| 9 | Follow-up Scheduler | 4 | 5 | 5 | 4 | 4.45 | **4** |
| 8 | Document Version Tracker | 3 | 5 | 4 | 5 | 4.00 | **5** |
| 3 | Cover Letter Generator | 5 | 3 | 3 | 4 | 3.95 | 6 |
| 7 | Job Alert Monitor | 4 | 3 | 3 | 4 | 3.55 | 7 |
| 1 | Portfolio/Blog Generator | 3 | 4 | 3 | 3 | 3.25 | 8 |
| 13 | Email Template Generator | 3 | 3 | 4 | 3 | 3.20 | 9 |
| 12 | Job Market Intelligence | 3 | 3 | 3 | 3 | 3.00 | 10 |
| 6 | Multi-Language Docs | 4 | 2 | 2 | 3 | 2.95 | 11 |
| 4 | Interview Prep Engine | 4 | 2 | 3 | 3 | 3.15 | 12 |
| 10 | Salary Benchmarking | 2 | 2 | 3 | 3 | 2.35 | 13 |
| 11 | Referral Finder | 2 | 2 | 3 | 2 | 2.20 | 14 |
| 14 | Career Trajectory Planner | 2 | 2 | 2 | 2 | 2.00 | 15 |
| 15 | AI Interview Coach | 3 | 1 | 2 | 2 | 2.15 | 16 |

### Reasoning (top and notable)

- **#25 JD Summarizer (rank 1 as foundation):** Feeds scorer, cover letters, interview prep. LLM parsing unavailable offline → heuristic extraction (skill keywords, years-of-experience regex, must-have vs nice-to-have sections). Honest ceiling: heuristics parse structure, not nuance — Claude skills remain the quality path; this makes output machine-usable.
- **#2 Match Scorer:** `SeenJobEntry.fit` exists but is manually set. Automating the first filter is the single highest-leverage change for daily use. Depends on #25 for parsed requirements.
- **#5 Dashboard:** Stats currently scattered across `reason summary`, `feedback channels`, `outcome list`, `tracker stats`. One command, read-only, zero risk.
- **#9 Follow-up:** Computed from tracker `date` + `status=applied` (no schema change — simplest thing that works). 7-day default.
- **#8 Version Tracker:** Additive `document_versions` table + additive CLI subcommand. Closes the template→outcome evidence gap the reasoning layer needs.
- **#3 Cover Letter Generator ranked 6, not top-5:** without an LLM call the body text is mad-libs. The Typst template + build CLI already compile; the writing quality lives in the Claude skill. A scaffolder adds little over `pipeline:docs`.
- **#4/#15 Interview tools:** content generation is inherently LLM work; a CLI produces skeletons only. Low feasibility without adding an API dependency (forbidden).
- **#6 Multi-language:** RTL Hebrew in Typst is real work (bidi, fonts); high impact for IL market but effort/feasibility kill it this round. Recommend as follow-up with user font decisions.

## Phase 2: Platform

| # | Feature | Impact | Feasibility | Effort | Integration | Weighted | Rank |
|---|---------|--------|-------------|--------|-------------|----------|------|
| 18 | REST API Layer (Bun.serve) | 4 | 5 | 4 | 5 | 4.40 | **1** |
| 17 | Docker Containerization | 3 | 5 | 4 | 4 | 3.85 | **2** |
| 16 | Web Dashboard | 5 | 3 | 2 | 4 | 3.75 | **3** |
| 23 | Automated Report Generator | 3 | 5 | 4 | 4 | 3.85 | 4 |
| 20 | Document Preview & Editor | 3 | 2 | 2 | 3 | 2.55 | 5 |
| 24 | TUI Dashboard | 2 | 2 | 2 | 3 | 2.15 | 6 |
| 21 | Job Board Integrations | 4 | 2 | 2 | 3 | 2.95 | 7 |
| 19 | Real-Time Scraper Monitor | 2 | 3 | 3 | 3 | 2.60 | 8 |
| 22 | Mobile App | 2 | 1 | 1 | 2 | 1.55 | 9 |

### Phase 2 architecture decision: **Option A — Monolith** (as the prompt recommends)

Single-user, local-first, SQLite. Concretely: **no Next.js install** — `Bun.serve` gives API routes + static file serving with zero new dependencies, honoring the no-new-deps spirit. The Web Dashboard (#16) ships as a static HTML page served by the API layer (#18), reading `/api/*`. Docker (#17) wraps the same process. This is Option A at minimum viable scale; Next.js remains the upgrade path if the UI outgrows one page.

- **#18 REST API first:** it's the substrate for 16, 19, 22. Bun.serve endpoints call existing functions directly.
- **#17 Docker:** Dockerfile + compose + volume for `data/`. Note: bind-mounted SQLite WAL on macOS Docker is fine for single writer.
- **#16 Dashboard:** static HTML + fetch, Kanban-by-status columns from tracker data. Scaffold level.
- **#23 (rank 4) folds into `pipeline:weekly`** from the integration pass — same report, so not built twice.

## Build List (this run)

Phase 1: #25 `scripts/jobs/summarize.ts` · #2 `scripts/match/score-job.ts` + batch · #5 `scripts/dashboard.ts` · #9 `scripts/followup.ts` · #8 `document_versions` in tracker + subcommand.
Phase 2: #18 `scripts/api/server.ts` (Bun.serve) · #17 `Dockerfile` + `docker-compose.yml` + `.dockerignore` · #16 `scripts/api/public/index.html` (static dashboard).
