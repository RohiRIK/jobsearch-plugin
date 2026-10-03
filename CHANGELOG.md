# Changelog

## Unreleased

## 2.4.0 - 2026-10-03

Findings from the owner-confirmed end-to-end run (9 cells, Typst 0.13.1).

### Fixed
- **Page 1 no longer ends early before a project.** A project was one unbreakable block (title, description and every highlight), so it jumped to page 2 and left 15-19% of page 1 empty. That failed `layout:density` on 6 of 9 cells, across all layouts. Only the heading and title are now kept with the description; highlights break normally. A non-final page may end up to 15% early, the size of the smallest unit that cannot split.
- **`layout:density` says which page and why.** "underfilled final page" was printed for page 1 too. A page that ends early now reports that a block moved to the next page, with a layout hint instead of advice to change the content.
- **ATS section order reads headings, not prose.** The word "experience" in the summary was taken for the Experience heading and failed a correctly ordered CV. Headings must now be a line of their own. The CV is checked against the order its source declares, so a custom `sectionOrder` and the `project-first` layout no longer fail.
- **GCP and AWS match their long names.** A profile with "Google Cloud Platform" left a posting's "GCP" as a gap, and review then rejected the abbreviation.

### Added
- **`EMPLOYER_UNCONFIRMED` review error.** A project may appear as a bullet under a role only when its `engagementId` names that role. Client cases with no confirmed employer were rendered under the current employer. Project evidence now states "Employer: ..." or "Employer: not confirmed".
- **`interests` in the profile**, printed as the CV's last line; `render --interests omit` leaves them out.
- **`profile:check` warnings** for project domains the matcher does not know (such a project is never selected) and for an `engagementId` that matches no role.

### Changed
- `workPreferences.maxOfficeDaysPerWeek` is optional, so work authorization can be recorded first. An explicit on-site office-day count then goes to `review`.

## 2.3.0 - 2026-10-02

### Added
- **`render --fit`.** When the chosen CV layout leaves the last page nearly empty or breaks the market's page budget, render compiles the other layouts on the same content and reports which fit, densest first, with page counts. It never switches layout; the agent shows the list and re-renders only with the layout the user picks. The density hint and the `cv` skill point to it (RohiRIK/jobsearch-plugin#7).

## 2.2.0 - 2026-10-02

### Added
- **`links` shipping gate.** Every clickable link in a CV or letter must be a well-formed http(s) URL that the profile owns (identity or project links). A stale or invented link now fails instead of shipping unseen (RohiRIK/jobsearch-plugin#8).

### Fixed
- **Declared honest gaps no longer license claims.** The cover-letter gap check is per sentence. A declared gap still allows disclosure ("I have not used Terraform yet", "Docker Swarm rather than Kubernetes"), but an affirmative first-person sentence about it ("I have run Terraform in production for years") fails `GAP_AS_CLAIM` (RohiRIK/jobsearch-plugin#13).
- **Danish postings are recognised as Danish.** Detection now decides the language family first, then among Danish, Norwegian and Swedish by words that differ. "du" and "et" no longer count for French (RohiRIK/jobsearch-plugin#14).
- **No silent language guess.** When a posting gives no reliable language signal in a market with several working languages, `render` asks for an explicit `--language` instead of treating the market default as the posting's language (RohiRIK/jobsearch-plugin#14).
- **Market detection matches whole words.** "bern" inside "Kubernetes" made any Kubernetes posting Swiss; "basel" (baseline) and "roma" (aroma) misfired the same way. Unicode-aware boundaries also fix "Malmö".
- `render` checks the CV template before the language, so `BAD_TEMPLATE` is reported first.

## 2.1.0 - 2026-10-02

### Added
- `jobsearch tools-install --tool typst` installs a pinned Typst release (0.13.1) into `<workspace>/data/tools/bin`, which binary resolution searches, so documents can be built without a hand-made PATH entry or a global install (RohiRIK/jobsearch-plugin#9).
- `hosts-doctor` reports which MCP server each host will start (`current`, `legacy`, `other` or `none`), lists legacy servers registered under any name, and says how to replace them (RohiRIK/jobsearch-plugin#10).
- `render --links linkedin,github,blog` chooses the profile links on the CV. The default is every link the profile has, including GitHub, which was never printed before. Render reports what it included and what it omitted (RohiRIK/jobsearch-plugin#8).

### Changed
- The brief's default language is the posting's: a stated working language first, then the language the posting is written in, then the market default. An English posting in Denmark is now briefed in English (RohiRIK/jobsearch-plugin#8).
- `render` refuses a draft whose language differs from the posting's until `--language` confirms it (`LANGUAGE_CHOICE_REQUIRED`), and reports the profile's languages with the decision (RohiRIK/jobsearch-plugin#8).

### Fixed
- **The company/role gate finds what render wrote.** It now takes the name from the same profile render uses, and finds the newest dated folder holding the documents. Before, a workspace without `data/config.json` failed `exists` (RohiRIK/jobsearch-plugin#11).
- **The application plan never tells the writer to prove a gap.** `mustProve` and the role thesis use only requirements the evidence supports; unsupported ones move to `openGaps` (RohiRIK/jobsearch-plugin#12).
- **Natural salutations.** `review` rejects a recipient that names the company or role (`UNNATURAL_SALUTATION`), such as "Dear Acme — Engineer" (RohiRIK/jobsearch-plugin#8).
- **Actionable density hint.** An underfilled CV page now names the denser layouts and the market's lower page budget. The orphan sweep covers every layout (RohiRIK/jobsearch-plugin#7).
- **Orphaned section headings.** A heading now travels in one unbreakable block with its first entry, and a role's title row with its first bullet. The templates relied on `block(sticky:)`, which needs Typst 0.12+, while the npm `typst` fallback is 0.10. In the pilot CVs that fallback left "Certifications" alone at the foot of page 1.
- **`strategy.sectionOrder` is honoured** (RohiRIK/jobsearch-plugin#5). The renderer passes it to the template. A section the order leaves out is appended, never dropped, and `project-first` places projects under the summary.
- **Every CV layout renders differently** (RohiRIK/jobsearch-plugin#4). Five of the ten layout ids used to produce the default page. Each id now has its own style row, and its description says what it actually changes. `render` refuses CV templates it cannot fill (banking) with `BAD_TEMPLATE`.
- **`GAP_AS_CLAIM` no longer rejects employer requirements** (RohiRIK/jobsearch-plugin#6). A cover-letter sentence that only attributes a requirement to the employer ("Your posting asks for…") is no longer read as a claim; one that also speaks in the first person still is.
- **Missing toolchain gets an install hint** (RohiRIK/jobsearch-plugin#3). When Typst, a TeX engine or `@napi-rs/canvas` is missing, the gate now says to install it, instead of "fix the source errors" or "shorten or wrap the affected field".
- **Hermes MCP entry matched by value** (RohiRIK/jobsearch-plugin#1). An entry written by `hermes config set` (unquoted command, block-list args) is recognised as already installed. An inline `mcp_servers` is refused rather than given a second key.
- **Host tests are hermetic** (RohiRIK/jobsearch-plugin#2). `JOB_SEARCH_BIN_PATH` replaces the binary search in tests, so an installed `openclaw` or `pi` no longer changes the results.
- An education field that repeats the degree title is no longer printed as a second line.

## 2.0.0 - 2026-10-01

### Added
- **Self-contained `job-search` plugin for every host.** `jobsearch` agent CLI (`src/jobsearch/`): `status`, `triage`, `rank`, `prepare`, `review`, `render`, `gate`, `scrape`, `followups`, `interview-prep`, `tracker-*`, `data-where|backup|migrate`, `hosts-list|doctor|install|uninstall`, `mcp`, and `run <tool>` for 22 single-purpose tools. One JSON envelope per call, semantic exit codes, `--help-json`, `--fields`, `--yes`/`--dry-run` on every write.
- Bundled toolchain in `job-search/dist/` (1.05 MB, no native files) plus templates, so a marketplace install needs only Bun. `plugin:build`, `plugin:check` (in `bun run gates`), `plugin:sync-skills`, `plugin:release`.
- Generated MCP server (`jobsearch mcp`): 7 tools / 4.6 KB of schema instead of 15 / 12.1 KB; Hermes `mcp.json` and Claude `.mcp.json` inside the plugin; Claude `userConfig.data_dir`.
- `manage` skill (Health, Hosts, Data, Audit, Extend, Release) and the synced skill factory (`create-skill`, `create-cli-agent`, `create-plugin` from RohiRIK/skills, pinned in `skill-sync.json`).
- Claude Code marketplace `rohirik` at the repository root; tool-less `reviewer` agent.
- `src/paths.ts`: code root vs workspace (`JOB_SEARCH_HOME` → checkout → `~/.local/share/job-search`); host installs and data migration never touch personal data.
- Hermes installation now supports explicit `--profile <name>` scoping with dry-run output; the default remains global and profile names are never stored in the plugin.
- A pinned, license-reviewed upstream CV template catalog with an explicit adapter/gate contract; no third-party source or personal profile is bundled into the plugin.
- Avatar-capable external template candidates identified for review: Brilliant CV (Apache-2.0), modern-typst-resume (Unlicense), Typst-CV-Resume (MIT), and modern-cv (license review required). They are reference candidates, not copied source.
- Template-aware avatar policy: layouts advertise whether they have an avatar slot, and the renderer only inserts an approved photo for layouts that support one; the showcase follows the same rule.
- A default `showcase` portfolio template that acts as a project warehouse: approved client work and personal projects are separated, with outcomes, domains, stack, links, and optional images.
- Market-gated optional CV photos and a redesigned modern CV/cover layout with grouped skills, a header subtitle, literal language metadata, and a conventional cover-letter subject line.
- A `layout:density` shipping gate that rejects technically safe but visibly underfilled final pages.
- All workflow skills now declare an agent-first contract: the agent runs the CLI internally and asks the user only for missing facts or approvals.
- A committed placeholder `data/profile.json.example` plus `profile:scaffold` and `profile:check` commands, so a fresh clone can create a validated, gitignored profile without fabricating personal data.
- Portable `job-search/` package support for Hermes Agent, Claude Code, OpenClaw, and Pi using the same canonical init, research, CV, and outcome skills.
- An explicit application plan now ranks professional experience, work projects, personal projects, and supporting evidence before the host LLM writes prose.
- Project disclosure states and explicit `projects approve|restrict <slug>` controls keep unreviewed or restricted work out of applications.
- Normalized job ingestion now records canonical URLs, stable content hashes, provenance, refresh dates, and available descriptions for deduplication.

### Changed
- `.claude/skills` and `.claude/commands` moved into the plugin; Claude Code commands are now `/job-search:<name>`. Portal scrapers are no longer model-visible skills (`USAGE.md`), only `jobsearch scrape` sources.
- Root `.mcp.json` removed (the plugin registers MCP); `opencode.json` runs the launcher. `.agents/install/hermes.sh` and `openclaw.sh` are thin wrappers around `jobsearch hosts-install` (one release).
- The raster layout check loads `@napi-rs/canvas` lazily; a missing module fails the gate with a reason.
- Pi can load the workflow as a local package, and the integration guide now documents setup and validation for all supported hosts.
- CV page gates now use the selected market profile instead of a global two-page requirement.
- Interview preparation consumes the same application plan and evidence priorities as the CV instead of relying on a generic talking-point list.
- Outcome recording now resolves company, role, channel, template, and cover-letter state from the tracker row.

### Fixed
- A bundled build resolved templates to a non-existent directory and returned `templates.cv: null` silently; missing templates are now an `unavailable` error.
- The Hermes installer could append a second `mcp_servers:` key to an existing config; the new installer merges into the existing block.
- Document filenames now derive from the active profile identity instead of the global naming config, and `reevaluate --profile` rejects a filename/content identity mismatch.
- Market CV page budgets no longer apply to one-page cover letters; the preview gallery now renders every page of multi-page layouts.

## 2026-07-18 — Evidence-grounded applications and document redesign

### Added
- Provider-neutral `application prepare|review|render` CLI for one evidence-linked CV and cover-letter contract, with strict JSON output, deterministic grounding checks, Typst rendering, and overwrite protection.
- MCP `prepare_application` and `review_application_draft` read-only tools plus the user-invoked `tailor_application` host-LLM prompt.
- Cold rendering regression tests that compile representative CV/cover-letter sources, query the rendered Typst structure, and exercise a real two-page CV.

### Changed
- Rebuilt the modern CV as a polished ATS-first single-column layout with literal contact text, plain skill labels, reliable fallback fonts, and breakable long experience sections.
- Reworked deterministic cover-letter prose to use actual responsibilities/achievements, removed unsupported outcome/scale claims, fixed latest-role selection, and corrected Typst string escaping.
- Slimmed `/apply` into an adapter for the shared cross-agent workflow; the canonical skill now routes evidence preparation, LLM drafting, review, rendering, visual inspection, and reevaluation.
- Reevaluation now fails closed when ATS extraction is unavailable; `--allow-missing-ats` is explicitly non-shipping degraded mode.

### Fixed
- Modern CV profile text no longer renders as literal Typst source, and experience bullets no longer disappear because of a shadowed type name.
- Classic and modern cover letters use ragged-right text to avoid rivers and forced mid-word breaks.
- Template listings hide metadata-only CV stubs, and ATS verification scans grouped application output recursively.
- Removed two tracked personal application sources that violated the repository privacy rule.

### Verified
- Strict TypeScript, full Bun suite, Typst CV/cover compilation, compiled-content queries, and page-by-page PNG inspection.

## 2026-07-17 — Strict mode, template expansion, code hardening

### Added
- **TypeScript strict mode** enabled (`tsconfig.json`: `strict: true`); `typescript` added as a devDependency to fix CI.
- **3 new Typst templates**: `templates/cv/modern` (two-column sidebar CV), `templates/cover/modern` (semi-formal cover), `templates/cover/casual` (personality-forward cover). All compile clean against `design-system.typ`.
- **Portfolio templates module** (`src/portfolio-templates.ts`): shared render helpers extracted from `scripts/generate/portfolio.ts`. Three templates added: `minimal` (system-ui mono), `modern` (Inter/JetBrains Mono OKLCH), `terminal` (green-on-black retro CLI). All support light/dark themes.
- **Tracker.database getter**: public read-only accessor for `Tracker.db`, replacing private-field hacks in callers.
- **SQL injection prevention** in `Tracker.update()`: column names validated against an `ALLOWED_COLUMNS` allowlist before interpolation.

### Changed
- Cover letter generator (`scripts/generate/cover-letter.ts`): skills now grouped by profile category with natural English prose (`summariseSkills()`); bullet templates varied (no longer monotonous "X — proven, current, and ready"); cleaner paragraph structure.
- Pipeline fit-score threshold bumped from 70 to 75 in `scripts/pipeline/cli.ts`.
- All stale `tools/` → `scripts/` path references fixed across `build/cli.ts`, `pipeline/cli.ts`, `match/score-job.ts`, `profile/reason.ts`, and `verify-ats.ts`.
- `pdftotext` invocation now uses `--` separator to prevent option injection.

### Removed
- Dead `cmdPipeline` function from `scripts/build/cli.ts` (dry-run stub, no callers).
- Empty `job_scraper/` directory.

### Fixed
- 6 strict-mode type errors across the codebase (new `strict: true` baseline).

### Verified
- `bunx tsc --noEmit` — strict-mode clean.
- `bun test tests/` — 93/93 tests passing.

## 2026-07-12 — Web dashboard redesign

### Changed
- Redesigned the web dashboard (`scripts/api/public/index.html`) with a deliberate design system: Inter + JetBrains Mono type pairing (mono tabular data), an OKLCH slate-indigo token ladder with a single amber accent, a sharp 2px/hairline stance, and restrained motion (one entrance stagger + hover feedback, collapsed under `prefers-reduced-motion`). Full light + dark themes. Same API wiring and data flow — verified served 200 with tokens intact.

## 2026-07-12 — Grouped application output

### Changed
- Generated CVs and cover letters now land in one folder per application: `assets/applications/<Company>/<YYYY-MM-DD>/`, named `<Name>_<Company>_<Role>_<CV|CL>`. `src/naming.ts` owns the layout (new `applicationDir` + grouped path builders, generation-date default); a recursive `walkDocuments` powers the naming lint and pipeline-docs scanners. The `/apply` skill, reevaluation gate, `naming check`, CLAUDE.md, and AGENTS.md all follow the new layout; `assets/applications/` is gitignored.

## 2026-07-12 — Hardening + developer experience

### Added
- **`bun run doctor`** — checks the toolchain (bun, typst, latex, pdftotext, pdfinfo), reports which document features work on this machine, and gives install hints for anything missing.
- Resilient fetch (15s timeout + one retry on 5xx/429 + shared User-Agent) in the 4 API scrapers.
- `pipeline scrape` summary now lists per-portal counts and an `errored` array, so a silent portal failure (e.g. jobbank's 403) is visible in the output.
- Regression tests for all the E2E fixes: `resolve-bin` PATH resolution, `readStdin`, followup default subcommand, reevaluate `.tex` handling, and `getPageCount` against committed 1-/2-page PDF fixtures. Suite 65 → 80.

### Fixed
- **MCP-harness concurrency flake**: the test contended with other processes on the shared `data/tracker.db`. Tracker now honors a `TRACKER_DB` env override; the harness uses a throwaway temp DB. Verified 5 consecutive green runs.

### Committed E2E fixes (from the overnight report)
- Snap-safe external-binary resolution (`src/resolve-bin.ts`) for typst/pdftotext/pdfinfo/latex; `getPageCount` prefers `pdfinfo` with a latin1 raw-scan fallback.
- `src/stdin.ts` reads `process.stdin` (snap blocks `Bun.stdin`'s `/dev/stdin`).
- followup defaults to `pending`; reevaluate accepts `.tex`; jobbank 403 error explains the edge-level block; MCP test spawns `process.execPath`.

## 2026-07-11 — Improvement loop (document quality, agents, scrapers)

### Added
- **Naming convention enforced**: outputs named `<Name>_<Company>_<Role>_<CV|CL>` via `src/naming.ts`; `bun run naming check|show` lints and prints correct names.
- **Reevaluation gate**: `bun run reevaluate` — compile freshness, exact page counts (CV=2, CL=1), ATS text layer, naming; exit 1 with fix hints until green. Mandatory in `/apply`; verdicts recorded with document versions (additive DB migration).
- **4 new scrapers** (public APIs/RSS only): Remote OK, Remotive, We Work Remotely (remote/US), Arbeitnow (EU) — 12 portals total; pipeline scrape now fetches portals concurrently.
- **5 new MCP tools** (13 total): select_template, market_snapshot, list_alerts, draft_cover_letter (read-only), interview_prep; all descriptions carry when-to-use guidance.
- **MCP stdio test harness** (real client, confirm-gate asserted), generator + quality-tool unit tests — suite now 65.
- `bun run trajectory` (skill-demand trends over market snapshots), `bun run portfolio` (profile → static HTML with honest placeholders), richer weekly report (market snapshot, unreviewed alerts, reevaluation verdicts).
- Per-agent install files under `.agents/install/`; persona quickstarts + troubleshooting in README; AGENTS.md carries naming/reevaluation rules.

### Fixed
- `verify-ats.ts` ran `main()` on import (broke importers); naming config lookup broken by the data/→src/ move (name prefix silently dropped); sqlite `busy_timeout` so concurrent tracker access waits; cover-letter generator no longer runs the scoring pipeline twice.

## 2026-07-11 — Repo restructure (multi-folder layout)

### Changed
- `tools/` → `scripts/` (CLI entrypoints); code extracted from `data/` → `src/` (`schemas`, `profile-schemas`, `tracker`, `naming`) — `data/` is now pure runtime data.
- `cv/` → `assets/cv/`, `cover_letters/` → `assets/cover_letters/` (fonts included); `documents/` → `docs/personal/` (personal-archive gitignore rules preserved).
- All references updated: package.json scripts, imports, tsconfig include, Dockerfile, `.dockerignore`, `.mcp.json`, `opencode.json`, installer, `.claude` skills/commands, CLAUDE.md, README, docs. Hermes + OpenClaw live configs re-pointed and re-probed (8 tools each).
- `migrate-csv` script restored (`scripts/migrate-csv.ts`) — root `job_search_tracker.csv` exists; earlier "moot" call was wrong.

### Verified
- tsc clean over `src/`+`scripts/`+`tests/` (tsconfig now also typechecks tests), 41/41 tests, all CLI smokes, cover letter compiles from `assets/`, `pipeline:docs` 2/2, Docker image builds and containerized API returns 200s.

## 2026-07-10 — Production push

### Added
- **CV Template Intelligence** (`scripts/match/template-engine.ts`, `scripts/select-template.ts` rewrite): weighted multi-factor scoring (sector, formality, market/RTL, role fit, seniority fit, profile fit) with per-factor rationale, confidence levels, and stub-availability guards. Wired into `pipeline full`.
- **Cover letter generator** (`scripts/generate/cover-letter.ts`): heuristic draft from profile + posting, compiles to PDF via typst.
- **Email template generator** (`scripts/generate/email.ts`): follow-up, thank-you, withdraw, referral — pulls context from the tracker by application id.
- **Interview prep engine** (`scripts/jobs/interview-prep.ts`): technical/behavioral questions, talking points, honest gap strategies.
- **Job alert monitor** (`scripts/jobs/alerts.ts`): list unreviewed scraped jobs, mark evaluated/skipped/expired.
- **Market intelligence** (`scripts/jobs/market.ts`): demand snapshot (skills, companies, locations, fit) with dated history saves.
- **CI**: GitHub Actions — `bun install --frozen-lockfile` → `tsc --noEmit` → `bun test` on push/PR.
- 16 unit tests for the template engine (suite: 41).

### Changed
- API server hardened: timing-safe API-key comparison, 200 KB request cap on `/api/score`, `X-Content-Type-Options: nosniff`.
- `.gitignore` covers personal pipeline data (`data/profile.json`, `data/reasoning.json`, `data/seen-jobs.json`, staging, reports, market, tracker WAL); `bun.lock` now tracked for reproducible CI/Docker builds.
- `SKILL_TERMS` exported from `scripts/jobs/summarize.ts` for reuse.

### Removed
- Dead `migrate-csv` package script (no CSV history exists — R7 closed).

### Verified
- Drushim + JobMaster scraper CLIs return live results (R9).
- 41/41 tests, clean typecheck, API auth flows exercised live.
- Docker: image builds, containerized API smoke-tested (200s). Fixed container bind — server now honors `HOST` env (0.0.0.0 in Docker, loopback default locally).
- Hermes Agent v0.18.2 + OpenClaw 2026.6.11 installed and wired to the MCP server — both probe-verified discovering all 8 tools. CI verified green on GitHub (2 runs).

## 2026-07-10 — Fable audit/features/integration run (earlier)
- Profile pipeline schema fixes, `GITHUB_TOKEN` support, security fixes (prototype pollution, URL encoding).
- Phase-1 features: JD summarizer, match scorer, dashboard, follow-up scheduler, document version tracker.
- Pipeline orchestrator (6 commands, resumable state), REST API + web dashboard, MCP server (8 tools, confirm-gated writes), Docker files, 25-test suite.
- Reports (now under docs/): AUDIT-REPORT, AUDIT-RECOMMENDATIONS, FEATURE-ASSESSMENT, FEATURE-IMPLEMENTATION, INTEGRATION-REPORT, AGENTS-INTEGRATION.

## Earlier
- Typst template design system; document generation & data pipeline overhaul; profile fetcher with reasoning feedback loop. See git history.
