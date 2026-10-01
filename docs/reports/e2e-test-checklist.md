# E2E Test Checklist — jobsearch-plugin

Date: 2026-07-11 | Commit: 1995a4a | Bun: 1.3.9

## 0. What I Changed (should NOT have been changed)
- [x] `scripts/build/cli.ts` — changed `bunx` → `typst` (reverted ✅)
- [x] `tests/mcp-server.test.ts` — changed `bun` → `process.execPath` (reverted ✅)
- [x] Installed Typst CLI binary at `~/.local/bin/typst` (not reverted — binary on disk)

## 1. Portal Scrapers (12 portals)
### Israeli Portals
- [x] alljobs-search search ✅
- [x] alljobs-search detail ✅
- [x] drushim-search search ✅
- [x] drushim-search detail (no detail endpoint) ⚠️
- [x] jobmaster-search search ✅
- [x] jobmaster-search detail (no detail endpoint) ⚠️

### Danish Portals
- [x] jobbank-search search ❌ 403 Forbidden (RSS blocked)
- [x] jobdanmark-search search ✅
- [x] jobindex-search search ✅
- [x] jobnet-search search ✅

### Remote / Global Portals
- [x] remoteok-search search ✅
- [x] remotive-search search ✅
- [x] arbeitnow-search search ✅
- [x] wwr-search search ✅

## 2. CLI Scripts — --help (22 scripts)
- [x] score ✅
- [x] summarize ✅
- [x] dashboard ✅
- [x] followup ✅
- [x] market ✅
- [x] alerts ✅
- [x] interview-prep ✅
- [x] cover-letter ✅
- [x] email ✅
- [x] select-template ✅
- [x] tracker ✅
- [x] templates ✅
- [x] verify-ats ✅
- [x] migrate-csv ✅
- [x] naming ✅
- [x] pipeline ✅
- [x] reevaluate ✅
- [x] trajectory ✅
- [x] portfolio ✅
- [x] build ✅
- [x] build:all ✅
- [x] verify ✅

## 3. CLI Scripts — Real Execution
- [x] score (real JD) ❌ EPERM: /dev/stdin not readable by Bun
- [x] summarize (real JD) ❌ EPERM: /dev/stdin not readable by Bun
- [x] dashboard ✅
- [x] followup ❌ Needs subcommand (pending/mark)
- [x] market --format text ✅
- [x] market --save ✅
- [x] alerts list ✅
- [x] interview-prep (real JD) ✅
- [x] cover-letter (real) ✅
- [x] email --type followup ❌ NOT_FOUND (fake app id)
- [x] select-template --list ✅
- [x] select-template --job (real JD) ✅
- [x] tracker --format json ✅
- [x] templates list ✅
- [x] naming check ❌ Exit 1 (violations found)
- [x] naming show ✅
- [x] reevaluate ❌ Page count unreadable + ATS pdftotext not found
- [x] verify-ats --all ❌ pdftotext not found (PATH issue)
- [x] portfolio ✅
- [x] trajectory ✅ (needs ≥2 snapshots)

## 4. MCP Server
- [x] Starts without errors ✅
- [x] tools/list returns 13 tools ✅
- [ ] get_profile — not tested (needs MCP client)
- [ ] list_jobs — not tested
- [ ] list_applications — not tested
- [ ] get_analytics — not tested
- [ ] pending_followups — not tested
- [ ] score_job — not tested
- [ ] add_application (confirm gate) — not tested
- [ ] update_application_status (confirm gate) — not tested
- [ ] select_template — not tested
- [ ] market_snapshot — not tested
- [ ] list_alerts — not tested
- [ ] draft_cover_letter — not tested
- [ ] interview_prep — not tested

## 5. API Server + Dashboard
- [x] Starts on 127.0.0.1:8317 ✅
- [x] GET / (dashboard HTML) ✅ HTTP 200
- [x] GET /api/profile ✅ HTTP 200
- [x] GET /api/jobs ✅ HTTP 200
- [x] GET /api/applications ✅ HTTP 200
- [x] GET /api/analytics ✅ HTTP 200
- [x] POST /api/score ✅ HTTP 200
- [x] Dashboard renders scraped jobs table ✅ (browser verified)
- [ ] Dashboard renders application board — empty (no apps tracked)

## 6. Pipeline Commands
- [x] pipeline:scrape ✅
- [ ] pipeline:full — not tested
- [ ] pipeline:profile — not tested
- [ ] pipeline:reason — not tested
- [x] pipeline:docs ❌ bunx not in PATH (snap)
- [x] pipeline:weekly ✅

## 7. Document Compilation
### LaTeX
- [x] CV — lualatex (main_example.tex) ✅ 2 pages
- [x] CV — lualatex (custom QuantumMachines) ✅ 2 pages
- [x] Cover letter — xelatex (custom QuantumMachines) ✅ 1 page

### Typst
- [x] CV banking template.typ ✅ (after Typst CLI install)
- [x] Cover classic template.typ ✅ (after Typst CLI install)

## 8. Profile Scripts (all --help)
- [x] profile --help ✅
- [x] profile:github --help ✅
- [x] profile:blog --help ✅
- [x] profile:linkedin --help ✅
- [x] profile:cv --help ✅
- [x] profile:merge --help ✅
- [x] profile:sync --help ✅
- [x] outcome --help ✅
- [x] reason --help ✅
- [x] feedback --help ✅

## 9. Type Check + Tests
- [x] tsc --noEmit ✅ zero errors
- [x] bun test ❌ 54/55 pass (MCP server test fails — bun not in PATH)

## 10. Docker
- [x] docker compose config ✅
- [x] docker build ✅
- [ ] Container serves dashboard — not tested
- [ ] Container serves API — not tested

## 11. Install Scripts
- [x] install-agent-skills.sh ✅ (OpenClaw needs network)
