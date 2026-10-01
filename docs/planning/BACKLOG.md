# Backlog

Status: `[ ]` todo · `[~]` in progress · `[x]` done+verified · `[P]` parked (user)

**Improvement loop contract:** work top-down through the first unchecked item below, one item per pass. Implement → verify with real command output → regression gate (tsc + bun test) → commit + push → confirm CI green → flip the checkbox with commit hash → append one line to `data/reports/improve-loop.log`. On usage/spend limit: stop cleanly. Never invent new scope mid-pass — add ideas as new `[ ]` items instead.

## M14 — Document quality gate (2026-08-19 analysis pass) — CLOSED by 7e6a2df
An analysis pass found the then-uncommitted `verify-ats.ts` rewrite had every regex double-escaped: the email check could never pass (gate unpassable) and the `(cid:*)` check could never match, so corrupt PDFs passed silently — failing *open*. `templates/design-system.typ` separately dropped every `cv-entry` bullet via an always-false `type(item) == content` guard (it compares a type against the `content` *parameter*, an array), so the shipped modern CV template rendered job titles with no achievements.

`7e6a2df` resolved all of it independently and went further: real `Usable line structure` and `CV section order` checks replaced the placeholder, with `tests/ats-quality.test.ts` and `tests/modern-cv-template.test.ts` covering both. Recorded because the failure mode is worth remembering, not because work remains.

- [x] P1-P6 (7e6a2df) regexes, CI, `-layout`, `resolve-bin`, the unused `pdf-parse` dep, and the `cv-entry` bullet guard.
- [ ] P7 **`pdftotext`/`pdfinfo` take path arguments without a `--` separator.** A filename beginning with a dash is read as a flag. Originally added as M2 in `a044a69`, lost in a later rewrite. Small; the only surviving item from that pass.
- **Lesson (no action):** a check that always returns the same answer still runs, still reports, and still looks healthy. Happy-path assertions cannot tell "passes because the document is good" from "passes because the check is broken" — every ATS check needs a case that must fail.

## M15 — Structural gaps (2026-08-19)
- [x] G6 (7e6a2df) **CV template selection had no consumer.** Closed by the evidence-grounded pipeline: `bun run application prepare|review|render`, `src/application-draft.ts`, `src/application-renderers.ts`, and the `prepare_application` / `review_application_draft` MCP tools. Documents now derive from a profile-backed evidence contract instead of being hand-written per application.
- [x] G7 (this commit) **Personal data was one `git add -A` from being committed.** Thirteen untracked-and-unignored personal files at the repo root — CV drafts, job descriptions, scratch — none matching any existing pattern because an ad-hoc name at the root matches none of them. Now `data/jd/` and `data/scratch/` with root-anchored ignore rules. The two tracked CV/cover sources carrying a real email, phone and LinkedIn URL were removed in `7e6a2df`; these rules keep them from returning. **They remain in git history from `e510df0` and are public — removing them there needs a history rewrite and force-push, a separate decision.**
- [ ] G8 **`naming check` exits 1 on pre-existing legacy files.** Violations under `assets/cv/` and `assets/cover_letters/` whose filenames predate the `_CV`/`_CL` convention, plus a stray `assets/applications/Stott-and-May/2026-08-17/test.tex`. A permanently-red check trains agents to ignore it — worse than the missing repo-root scan it was originally filed for. Decide per file: rename, or exempt legacy paths.
- [ ] G10 **Documents generated before the single-column modern template fail the new `CV section order` check.** e.g. `assets/applications/Jane/2026-07-17/..._CV.pdf` extracts as `experience -> skills -> projects -> education` with no profile section ahead of it. The check is behaving correctly — the old two-column CV genuinely had an ATS-hostile reading order — but every pre-`7e6a2df` document now fails the gate. Decide whether to re-render the back catalogue or scope the check to newly generated documents.
- [ ] G9 **No tests for the REST API or `scripts/profile/feedback.ts`.** The API carries the auth-sensitive code (timing-safe key compare, 200 KB body cap, `nosniff`) and is the one surface with no regression net.

## M16 — Agent plugin: one `jobsearch` tool, one plugin, every host (2026-10-01)
Spec: `specs/agent-plugin.md`. Results: `docs/reports/2026-10-01-agent-plugin-efficiency.md`. One PR per item; each ends with `bun run gates` green. AP4 and AP5 can run in parallel after AP3.
- [x] AP0 Lock host contracts: current official docs for Hermes v1, Pi, OpenCode, OpenClaw, Cowork, Codex/Gemini → `docs/planning/host-contracts.md`; resolve the spec's open decisions.
- [x] AP1 Self-contained `jobsearch`: `src/paths.ts` (43 call sites + lint test), rename `agent` → `jobsearch`, new commands (status, prepare, review, render, gate, scrape, tracker-add, outcome, data-*, mcp), loud asset failures (the bundled triage returned `templates.cv: null` silently), triage cache, `--fields`, call log, `plugin:build` bundle + launcher + freshness test.
- [x] AP2 MCP generated from the command table: ≤ 7 tools, ≤ 4 KB schema (today 15 / 12.1 KB); legacy names behind a flag for one release.
- [x] AP3 The plugin: consolidate the four skill trees into `job-search/`, plugin-local `.mcp.json` + `userConfig.data_dir`, reviewer agent, root `marketplace.json`; `claude plugin validate --strict` passes.
- [x] AP4 `manage` skill (Health, Extend, Hosts, Release, Audit, Data) built via the synced `create-skill`; `plugin:sync-skills` for create-skill / create-cli-agent / create-plugin with a drift test.
- [x] AP5 `jobsearch hosts-*` installers (dry-run exit 10, `--yes`, collision exit 5, idempotent) replacing `hermes.sh` / `openclaw.sh`.
- [x] AP6 `tests/context-budget.test.ts` + `job-search/evals/` + before/after report (evals written, not run — they bill the plan).
- [ ] AP7 Run the eval suite against the installed plugin and record WITH/W/OUT Δ and cost in the report.
- [ ] AP8 Verify on real hosts: `hermes plugins doctor ./job-search`, `pi -e ./job-search`, OpenCode/OpenClaw `hosts-install`, Bun inside Cowork.

## M12 — Harden the E2E fixes + reliability (2026-07-12)
The 8 E2E fixes (commit a2f0b09) shipped without regression tests, and fire #1 saw a transient MCP-harness flake. Close both.
- [x] G1 (this commit) Test src/resolve-bin.ts: resolves a known binary (bun/sh), returns null for a nonexistent one, `augmentedPath()` prepends the extra dirs.
- [x] G2 (this commit) Test followup default subcommand (no arg → pending, not BAD_CMD) and `reevaluate` accepting a `.tex` source path.
- [x] G3 (this commit) Test src/stdin.ts readStdin end-to-end (spawn score/summarize with piped stdin → skills extracted) — guards the snap EPERM fix from silent regression.
- [x] G4 (this commit) MCP-harness flake: give the test its own tracker DB (env-var override or temp copy) so it never contends with a concurrent process; verify 5 consecutive green runs.
- [x] G5 (this commit) getPageCount: unit-test the pdfinfo-preferred path and the latin1 raw-scan fallback against a real compiled PDF.

## M13 — Developer experience & robustness (2026-07-12)
- [x] X1 (this commit) bun run doctor — one command that checks the toolchain (bun, typst, pdftotext/pdfinfo, latex) and reports what document features are available on this machine, with install hints for anything missing.
- [x] X2 (this commit) Scraper resilience: shared fetch helper with timeout + one retry + a common User-Agent across the 4 new API scrapers (remoteok/remotive/arbeitnow/wwr), so a transient network blip doesn't drop a portal.
- [x] X3 (this commit) pipeline scrape summary line: per-portal counts + which portals errored, so a silent 403 (like jobbank) is visible in the output, not just the log.

## M6 — Document quality loop (user-flagged, highest priority)
- [x] N1 (cf3f1a1) Naming convention enforced end-to-end: `cover-letter.ts` outputs via `buildSourcePath("cl", company, role)` → `Name_Company_Role_CL.typ` (src/naming.ts is the single owner); gitignore patterns for `*_CV.*`/`*_CL.*` personal outputs; `naming check` CLI subcommand that lints existing files in assets/cv + assets/cover_letters against the convention and suggests `git mv` renames (parseFileName already exists).
- [x] N2 (64dc111) Reevaluation process: `scripts/reevaluate.ts` (`bun run reevaluate --company X --role Y` or `--file <pdf>`) — compile if source newer, then gate: page expectations (CV=2, CL=1 from build config), ATS text-layer extraction, contact details present as literal text, naming compliance; JSON report with per-gate pass/fail + concrete fix hints; exit 1 on any fail so agents must iterate until green. Wire into /apply skill (mandatory step) and document in CLAUDE.md verification section.
- [x] N3 (93907f6) `pipeline:docs` and MCP `add_application` flows record the reevaluation verdict with the document version.

## M7 — Post-restructure end-to-end test sweep
- [x] T5 (no code change — 35/35 invocations pass) Exercise every package.json script (35+) with real invocations; fix any path stragglers from the restructure.
- [x] T6 (a39d1c6+e1d494e) MCP tool harness: call all 8 tools through stdio (scripted client), assert shapes; API route sweep incl. POST/PATCH; both installer scripts on clean simulated HOME.
- [x] T7 Docker rebuild+smoke — image rebuilt with M6/M7/A1 changes, container API+dashboard 200s (daemon restarted 2026-07-11).

## M8 — Agent surface expansion
- [x] A1 (639f106) New MCP tools for the newer CLIs: select_template, market_snapshot, list_alerts (+ mark with confirm), draft_cover_letter, interview_prep — same Zod/confirm patterns as existing 8.
- [x] A2 (this commit) Richer MCP tool descriptions (when-to-use, arg examples) — AI-facing docs.
- [x] A3 naming + reevaluate already registered as package scripts (N1/N2); README entry lands with D4.

## M9 — Documentation for humans and agents
- [x] D4 (done) README: quickstart per persona (human daily use / agent integration / developer), troubleshooting section.
- [x] D5 (done) SETUP.md refresh post-restructure; document the improvement loop + install/ scripts.
- [x] D6 (done) AGENTS.md: add reevaluation + naming rules once N1/N2 land.

## M10 — Scraper expansion: US, EU, remote (user-requested 2026-07-11)
ToS-conscious: portals with public APIs/RSS only — no Indeed/LinkedIn HTML scraping (violates their terms; a LinkedIn CLI already exists separately). Each scraper: Tier-1 CLI in `.agents/skills/<name>-search/cli` following the drushim pattern (`search -q ... --limit`, `{meta, results}` JSON), registered in pipeline `PORTALS` with the right market tag, live-verified with a real query.
- [x] S1 (65215cc) RemoteOK (`remoteok-search`) — public JSON API (remoteok.com/api), market: remote/us.
- [x] S2 (65215cc) Arbeitnow (`arbeitnow-search`) — public JSON API (arbeitnow.com/api/job-board-api), market: eu.
- [x] S3 (65215cc) Remotive (`remotive-search`) — public API (remotive.com/api/remote-jobs), market: remote.
- [x] S4 (65215cc) WeWorkRemotely (`wwr-search`) — public RSS feeds, market: remote/us.
- [x] S5 (65215cc) Pipeline efficiency: run portals concurrently (currently sequential) — keep per-portal timeout + partial-success semantics.

## M11 — FABLE-FEATURES second pass (mined 2026-07-11)
- [x] B1 (this commit) #23 Richer weekly report: fold market snapshot, pending alerts, follow-ups due, and reevaluation verdicts into `pipeline:weekly`.
- [x] B2 (this commit) #1 Portfolio page generator: profile.json → self-contained static HTML (assets/portfolio/index.html) — GitHub repos + skills; honest placeholders where profile data is missing.
- [x] B3 (this commit) #14 Career trajectory (lite): skill-demand trend over saved `data/market/*.json` snapshots; needs ≥2 snapshots, says so honestly otherwise.
- Not mined (reasons): #11 referral finder (needs LinkedIn graph), #15 AI coach (needs LLM runtime; interview-prep covers deterministic part), #19 scraper monitor (pipeline state + alerts cover it), #20/#22/#24 (platform scope, prior rationale), #6 multi-language (R5 — user decisions), #10 salary (salary-search project).

## M0 — Hygiene
- [x] H1 Extend .gitignore for personal/runtime data (+ un-ignore bun.lock for CI/Docker)
- [x] H2 Remove broken `migrate-csv` script (R7 moot — no CSV exists)
- [x] H3 Commit existing work in logical chunks (10 local commits; paths sanitized in FABLE-*.md)

## M1 — CI/CD
- [x] C1 GitHub Actions workflow: install → tsc → test (b269fa2, lint + local simulation pass)

## M2 — CV Template Intelligence
- [x] T1 Scoring engine: profile-aware, JD signals, weighted factors, rationale, confidence, availability flag (425e5c7)
- [x] T2 Unit tests for engine — 16 tests, suite 41/41 (c151dec)
- [x] T3 availability in listing (`select-template --list` carries available flag)
- [x] T4 Selection wired into pipeline `full` (e05a18e) — M2 complete

## M3 — Features
- [x] F3 Cover letter generator (`scripts/generate/cover-letter.ts`, c0cad1c, PDF-verified)
- [x] F13 Email template generator (`scripts/generate/email.ts`, 9b36be1)
- [x] F12 Market intelligence (`scripts/jobs/market.ts`, 9342e9d)
- [x] F7 Job alert monitor (`scripts/jobs/alerts.ts`, a835afa)
- [x] F4 Interview prep engine (`scripts/jobs/interview-prep.ts`, 7550941) — M3 complete

## M4 — Verify & ops
- [x] V1 Security sweep — no traversal found; hardened key compare, size cap, nosniff (4517297)
- [x] V2 R9 scraper live check — drushim + jobmaster both return live results, exit 0
- [x] V3 Full verify sweep — 18/18 checks (tsc, 41 tests, 12 CLI smokes, API 200s, MCP loads, CI present, no personal data staged)

## M5 — Docs
- [x] D1 README update (66f38f9)
- [x] D2 CHANGELOG.md (66f38f9)
- [x] D3 FEATURE-IMPLEMENTATION.md refresh + project_memory.md (829a716)

## Parked (user)
- [P] R1 real CV/LinkedIn data · [P] R2 GITHUB_TOKEN · [P] R5 multi-language docs · [P] Docker build verify (daemon down) · [P] push/PR
