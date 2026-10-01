# Feature Implementation — Status

Top 5 Phase 1 + top 3 Phase 2 from FEATURE-ASSESSMENT.md. All verified in-session: `bunx tsc --noEmit` clean, `bun test tests/` 25/25 pass, every command smoke-tested with real invocations.

## Phase 1 (built, verified)

### #25 JD Summarizer — `scripts/jobs/summarize.ts` ✅
**Acceptance criteria:** raw JD text (file or stdin) → structured JSON with required vs nice-to-have skills, years, spoken languages, remote mode, education, salary; Hebrew-aware; exit 0/1; `--help`.
**Verified:** parsed a Hebrew/English hybrid JD — 7 required skills, `azure`/`intune` correctly classified nice-to-have via section detection, `hybrid` detected, 3 years extracted. 5 unit tests including word-boundary false-positive guard ("Golang" does not match "go").
**Honest limits:** keyword dictionary + section heuristics; nuanced parsing stays with the Claude skills. Command: `bun run summarize --input job.txt`.

### #2 Job Match Auto-Scorer — `scripts/match/score-job.ts` ✅
**Acceptance criteria:** JD (raw text or summarize JSON) + profile → 0-100 score, weighted skills 40/experience 25/sector 15/location 10/language 10, gaps list, `--save` to `data/matches/`.
**Verified:** live scoring against the real profile; missing data scores *neutral and says so* in a `neutral` array (no fake precision). 5 unit tests: high-match ≥80, missing skills → gaps, empty profile/JD never crash, bounded 0-100. Command: `bun run score --input job.txt --company X`.

### #5 Pipeline Dashboard — `scripts/dashboard.ts` ✅
**Acceptance criteria:** one command showing pipeline counts, response/interview rates, channel rankings, top rejection reasons, pending follow-ups, recent activity; `--format json|text`.
**Verified:** both formats run against live tracker + outcomes.json + reasoning.json. Found-and-fixed during build: outcomes.json is a bare array, not an object wrapper. Command: `bun run dashboard`.

### #9 Follow-up Scheduler — `scripts/followup.ts` ✅
**Acceptance criteria:** `pending [--days N]` lists applied-status applications ≥N days old without a recorded follow-up; `mark <id>` stamps `[followup YYYY-MM-DD]` into notes. No schema change.
**Verified:** 5 unit tests (threshold, status filter, already-marked exclusion, sort order). Command: `bun run followup pending`.

### #8 Document Version Tracker — `data/tracker.ts` + `scripts/tracker.ts` ✅
**Acceptance criteria:** `document_versions` table (additive); `tracker versions [--template|--company|--outcome]` with LEFT JOIN to application status; `version-add` manual entry; `pipeline:docs` records versions automatically.
**Verified:** 2 unit tests including the outcome-join filter; `pipeline:docs` recorded versions for 2 compiled documents.

## Phase 2 (built at scaffold-or-better level)

### #18 REST API — `scripts/api/server.ts` ✅
Bun.serve (zero new deps), binds 127.0.0.1, optional `API_KEY` header auth. Routes: GET profile/jobs/applications/analytics/reasoning, POST applications + score, PATCH applications/:id, GET / (dashboard). **Verified:** all 7 routes returned expected payloads in-process (200s + 404 handling). Command: `bun run api`.

### #17 Docker — `Dockerfile`, `docker-compose.yml`, `.dockerignore` ⚠️ written, NOT build-verified
oven/bun base, `data/` volume, scraper as compose profile, personal data dockerignored. **Docker build was not run this session** — verify with `docker compose up --build`.

### #16 Web Dashboard — `scripts/api/public/index.html` ✅ (scaffold)
Static self-contained page: stat tiles, status-column Kanban board, new-jobs table with links. **Verified:** served at `/` with correct content-type; fetches the three live API endpoints. Monolith decision per assessment — no Next.js dependency; upgrade path documented.

## Production push additions (2026-07-10, second run — all verified live)

### CV Template Intelligence — `scripts/match/template-engine.ts` + `scripts/select-template.ts` ✅
Weighted multi-factor scoring engine replacing rule matching: sector, formality, market/RTL, role fit, seniority fit, profile fit — per-factor rationale, confidence level (signal strength × profile completeness), stub-availability guard (stubs ranked, never auto-selected). Wired into `pipeline full` output. 16 unit tests. Commands: `bun run select-template --job job.txt`, `--list`.

### #3 Cover Letter Generator — `scripts/generate/cover-letter.ts` ✅
Heuristic draft (marked DRAFT, /apply polishes prose): profile + posting → filled classic template, typst-compiles to PDF (verified). Honest matched/gaps in output. Command: `bun run cover-letter --company X --role Y [--job f] [--compile]`.

### #13 Email Template Generator — `scripts/generate/email.ts` ✅
followup / thank-you / withdraw / referral; pulls company/role/days-since from tracker by `--id`. Command: `bun run email --type followup --id <app-id>`.

### #4 Interview Prep Engine — `scripts/jobs/interview-prep.ts` ✅
Technical questions from required skills, seniority-aware behavioral set, talking points (GitHub, Claude Code), honest gap strategies, questions-to-ask. Command: `bun run interview-prep --job job.txt`.

### #7 Job Alert Monitor — `scripts/jobs/alerts.ts` ✅
list (fit/market/since filters) + mark/mark-all over `data/seen-jobs.json` statuses. Command: `bun run alerts list`.

### #12 Market Intelligence — `scripts/jobs/market.ts` ✅
Demand snapshot: markets, fit, status, top skills/companies/locations; `--save` to `data/market/<date>.json`. Command: `bun run market --format text`.

### CI — `.github/workflows/ci.yml` ✅
bun install (frozen lockfile) → tsc → tests, on push/PR. All steps verified locally.

## Not built (deliberate, with rationale)
Portfolio generator (#1 — static-site scope creep for a job-search workspace), multi-language docs (#6 — needs user font/RTL content decisions → R5), salary benchmarking (#10 — ported to the separate salary-search project), referral finder (#11), trajectory planner (#14), AI interview coach (#15 — needs LLM runtime; /apply and interview-prep cover the deterministic part), scraper monitor (#19 — alerts + pipeline state cover it), doc preview editor (#20), OAuth job-board integrations (#21 — external credentials), mobile app (#22 — disproportionate), report generator (#23 — pipeline:weekly covers it), TUI dashboard (#24 — web dashboard covers it).
