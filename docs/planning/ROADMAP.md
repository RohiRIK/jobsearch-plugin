# Roadmap — AI Job Search Workspace

## Phase 2 (2026-07-11 →): continuous improvement loop

Phase 1 (M0–M5, below) is complete. Work now proceeds through an **every-3-hours improvement loop** (session cron) executing BACKLOG.md top-down, one item per fire:

- **M6 Document quality** (user-flagged): naming convention `Name_Company_Role_CV|CL` enforced everywhere via `src/naming.ts`, plus a mandatory **reevaluation gate** for generated documents (compile → page counts → ATS text layer → naming → fix hints, exit 1 until green) so a bad CV gets caught and regenerated instead of shipped.
- **M7 Post-restructure test sweep**: every package script, all MCP tools via stdio, API routes, installers, Docker.
- **M8 Agent surface expansion**: MCP tools for the newer CLIs (template selection, market, alerts, cover-letter draft, interview prep), richer AI-facing tool descriptions.
- **M9 Docs**: human quickstarts + troubleshooting; agent rules updated as gates land.

Loop is rate-limit-resilient: a fire that hits the usage limit stops cleanly; the next fire (3h later) resumes from the backlog state. Progress log: `data/reports/improve-loop.log`.

---

# Phase 1 (complete) — production push, 2026-07-10

Baseline at start: `bunx tsc --noEmit` clean, 25/25 tests pass, all prior Fable-run work uncommitted on `feat/profile-fetcher`. Remote is public GitHub.

## Milestones (dependency order)

### M0 — Repo hygiene & safety (blocks everything)
- Extend `.gitignore`: personal/runtime data (`data/profile.json*`, `data/staging/`, `data/reasoning.json`, `data/seen-jobs.json`, `data/pipeline-state.json`, `data/reports/`, `data/tracker.db-shm`, `data/tracker.db-wal`, `data/matches/`, `.agent-state.md`, `.interceptor-research/`).
- Fix broken `migrate-csv` package script (target `data/migrate-csv.ts` does not exist; no CSV present → remove script, R7 closed as moot).
- Commit existing verified work in logical chunks (local commits only; no push without user).

### M1 — CI/CD (R6)
- `.github/workflows/ci.yml`: bun setup → `bun install --frozen-lockfile` → `bunx tsc --noEmit` → `bun test tests/`.
- Runs on push + PR. No secrets required.

### M2 — CV Template Intelligence (flagship)
Upgrade `scripts/select-template.ts` from keyword rule-matching to a scoring engine:
- Inputs: job posting, `data/profile.json` (skills, experience, seniority, certifications), template registry (`templates/*/meta.json`).
- Signals: sector/industry, role type, seniority, formality, market + language (RTL), company size, required certifications, skill alignment.
- Weighted multi-factor score per template with per-factor rationale, confidence level, and availability check (`template.typ` present → stubs ranked but flagged, never auto-selected). Resolves R3 without deleting metas.
- Tier 1 CLI: JSON stdout, exit 0/1, `--help`. Unit tests.
- Wire into pipeline `docs` step + expose via MCP/API where natural.

### M3 — Remaining feasible features (below prior cutoff, effort-boxed)
- #3 Cover letter generator: profile + JD → filled cover `.typ` from template.
- #13 Email template generator: follow-up / thank-you / withdrawal from tracker entry.
- #12 Job market intelligence: aggregate `data/seen-jobs.json` → skills/sector/location frequency report.
- #7 Job alert monitor: diff new scrape results vs seen-jobs → alert report (scrape dedup already exists; this is the reporting layer).
- #4 Interview prep engine (heuristic): JD + profile → likely questions, talking points, gap prep.

**Explicitly out of scope (with rationale, per FABLE-FEATURES' own top-N instruction):**
#22 mobile app (React Native — disproportionate for a local workspace), #24 TUI dashboard (web dashboard covers it), #20 live Typst preview editor (editor tooling, low ROI), #21 OAuth job-board integrations (external credentials), #1 portfolio site generator, #10 salary benchmarking (ported to salary-search project), #11 referral finder, #14 trajectory planner, #15 AI interview coach (needs LLM runtime).

### M4 — Verification & ops
- Security sweep: API server (path traversal, auth), MCP write gates, injection surfaces.
- R9: live-check Drushim/JobMaster scraper CLIs (network best-effort).
- Docker: daemon DOWN on this machine — config review only; build-verify parked for user.
- Full verify: tsc, tests, pipeline smoke, API smoke.

### M5 — Documentation
- README reflects final tool inventory; CHANGELOG.md; refresh FEATURE-IMPLEMENTATION.md; project_memory.md updated.

## Parked — requires user
- R1: real CV/LinkedIn data staged (profile has 0 experience/education until then).
- R2: `GITHUB_TOKEN` in `.env`.
- R5: Hebrew RTL / Danish document variants (content + design decisions).
- Docker build verify (daemon down) · push/PR to public remote.
