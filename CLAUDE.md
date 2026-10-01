# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Two things at once, and the distinction matters:

1. **A job-application workspace** — Claude acts as career advisor for the candidate below: evaluating postings, tailoring CVs/cover letters, interview prep. Driven by `.claude/commands/` slash commands (`/apply`, `/scrape`, `/rank`, `/setup`, `/outcome`, `/expand`, `/add-template`, `/add-portal`, `/reset`) and `.claude/skills/`.
2. **A TypeScript/Bun toolchain** — the deterministic half of that workflow (scoring, template selection, compilation, ATS verification, tracking, MCP/REST surfaces) lives in `src/` + `scripts/` and runs with no agent involved.

When a task is "help me apply to X", you are in mode 1 and must use the workflow and checklists below. When a task is "fix/extend the tooling", you are in mode 2 and must keep `bunx tsc --noEmit` and `bun test tests/` green.

Fork of [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search); see README for the enhancement delta.

## Candidate profile

The candidate profile is personal and never committed. Claude Code loads `CLAUDE.local.md` (gitignored) automatically: copy `CLAUDE.local.md.example` to `CLAUDE.local.md` and fill it in, or let the `init` skill build `data/profile.json` and sync it there. Skills read facts from `data/profile.json` only.

## Entry point

`job-search/` is one self-contained plugin for Claude Code, Hermes Agent, OpenCode, OpenClaw and Pi: `plugin.json` + `mcp.json` (Hermes, Agent Plugins v1), `.claude-plugin/plugin.json` + `.mcp.json` (Claude Code), `package.json` (Pi). The toolchain is bundled into `job-search/dist/` and templates into `job-search/templates/` by `bun run plugin:build`; both are committed because marketplace installs never build, and `bun run plugin:check` fails when they are stale. Host formats are recorded, with sources, in `docs/planning/host-contracts.md`.

Skills: `init`, `research`, `cv`, `outcome`, `manage` (operate/extend/release the system), plus `create-skill`, `create-cli-agent`, `create-plugin` synced from RohiRIK/skills by `bun run plugin:sync-skills` (generated — edit the library, never the copy). The former `.claude/skills` and `.claude/commands` now live inside the plugin; in Claude Code the commands are namespaced (`/job-search:apply`, `/job-search:rank`, `/job-search:setup`, …). This repo's `.claude/settings.json` declares the `rohirik` marketplace and enables the plugin; for live edits run `claude --plugin-dir ./job-search`.

The skills **orchestrate; they never restate**: they call `jobsearch <command>` (or `jobsearch run <tool>`), and `tests/job-search-plugin.test.ts` asserts every command a plugin doc names exists, the manifests agree, the Hermes field set/name pattern/`mcp.json` shape hold, no skill and command share a name, and no plugin doc points at repo-only paths. Skill `allowed-tools` must stay a scalar string — Hermes skips a skill whose value is a YAML list.

## Commands

```bash
bun install
bunx tsc --noEmit                 # strict-mode typecheck — CI gate
bun test tests/                   # full suite — CI gate
bun test tests/tracker.test.ts    # single file
bun test tests/ -t "score"        # single test by name
bun run doctor                    # environment check (typst/lualatex/pdftotext presence)
```

Document build & gating (the shipping gate must pass before a submission-ready document is shown to the user; `--allow-missing-ats` produces an explicitly non-shipping local pilot only):

```bash
bun run naming show "<Company>" "<Role>"    # exact output paths for an application
bun run naming check                        # audit existing filenames
bun run reevaluate --company X --role Y     # THE gate: always compile current imports + page count + raster layout + ATS + naming
bun run build <file.typ|tex>                # single doc; engine auto-detected
bun run build:all                           # every source under the configured dirs
```

Analysis and generation CLIs (all take `--input file` or stdin, all emit JSON unless `--format text`):

```bash
bun run application prepare --company X --role Y --job job.txt   # evidence contract → LLM prompt bundle (writes nothing)
bun run application review  --draft d.json --job job.txt         # schema, evidence refs, unsupported numbers, style
bun run application render  --draft d.json --job job.txt          # review, then write convention-named Typst CV + CL
bun run jobsearch --help-json               # agent-first entrypoint (= job-search/scripts/jobsearch): command/flag/exit schema
bun run jobsearch status                    # workspace, profile, tracker, follow-ups, document toolchain, next steps
bun run jobsearch triage --job job.txt      # summarize + score + market + template + projects in ONE compact envelope
bun run jobsearch rank                      # batch triage of <workspace>/data/jd → NDJSON, best fit first
bun run jobsearch tracker-status --id app_… --status interviewing --dry-run   # writes need --yes; --dry-run exits 10
bun run plugin:build | plugin:check | plugin:sync-skills | plugin:release   # plugin maintenance
bun run summarize --input job.txt           # JD → structured JSON
bun run score --input job.txt               # 0-100 fit score + gaps
bun run select-template --job job.txt       # ranked templates with per-factor rationale
bun run cover-letter --company X --role Y   # heuristic draft (.typ → PDF)
bun run interview-prep --job job.txt
bun run dashboard / followup pending / alerts list / market / trajectory
bun run pipeline:full --job job.txt         # orchestrated; --resume via data/pipeline-state.json
bun run api                                 # REST + dashboard on 127.0.0.1:8317
bun run jobsearch mcp                       # generated MCP server over stdio (bun run mcp = previous server, one release)
```

## Architecture

**Layering.** `src/` holds the shared modules every script imports; `scripts/` holds thin Bun CLIs; nothing in `scripts/` should own logic that two CLIs need. Imports use `.js` extensions on `.ts` files (ESNext + bundler resolution).

**`src/naming.ts` is the single source of truth for where documents live.** Every producer (build CLI, cover-letter generator, reevaluate gate, MCP write tools) resolves paths through `buildOutputPath` / `buildSourcePath` / `applicationDir` rather than joining strings. Convention: `assets/applications/<Company>/<YYYY-MM-DD>/<Name>_<Company>_<Role>_<CV|CL>.<ext>`, driven by `data/config.json` (`name`, `sourceExt`, separators). `assets/cv/` and `assets/cover_letters/` are legacy flat dirs kept readable for pre-migration files. Changing naming means changing this module, not the callers.

**Engine detection is by file content, not flags** (`scripts/build/cli.ts:detectEngine`): `.typ` → typst; `.tex` containing `moderncv` → lualatex; other `.tex` → xelatex. `sourceExt` in `data/config.json` is currently `typ`, but the `/apply` slash-command workflow still drafts LaTeX — both paths are live and both must keep working.

**External binaries are resolved through `src/resolve-bin.ts`, never `Bun.which` alone.** Snap-packaged Bun on Ubuntu spawns with a stripped PATH, so `typst`/`pdftotext`/`pdfinfo` are invisible; `resolveBin` probes standard install dirs and `augmentedPath()` patches child-process PATH. Any new subprocess call must use these.

**Portfolio projects are matched to the job, not dumped.** `src/project-matching.ts` decides which of the portfolio belongs on a given CV: domain first, stack second. An endpoint dashboard is the wrong evidence for an ML role and a RAG assistant is wrong for a device role, even though both share Docker and Python — `DOMAIN_CONFLICTS` excludes rather than merely down-ranks those. `buildEvidenceLedger` only puts the selected projects in front of the drafting model. Sync from the blog with `bun run projects sync`; inspect with `bun run projects match --job <file>`. Two rules learned from real data: match on **word boundaries** (`containsPhrase` — "llm" matched inside "enrollment" and tagged an Intune migration as ML work), and infer domains from **curated summary text only**, never the MDX body.

**Document generation is an evidence-grounded three-stage pipeline** (`scripts/generate/application.ts`, `src/application-draft.ts`, `src/application-renderers.ts`): `prepare` emits a provider-neutral prompt bundle and writes nothing, the host LLM drafts against it, `review` validates the draft's schema, evidence references, unsupported numbers and style, and `render` writes the convention-named Typst CV + cover letter. Claude Code's `/apply` is a thin adapter over that workflow, and the MCP equivalents are `prepare_application` / `review_application_draft` plus the `tailor_application` prompt. `bun run cover-letter` remains a heuristic fallback. The point is that claims in a document trace back to profile evidence rather than being invented at draft time.

**The ATS checks need positive *and* negative tests.** Every regex in `scripts/verify-ats.ts` was once double-escaped: the checks still ran and still reported, they just always returned the same answer — email always failed (gate unpassable), `(cid:*)` always passed (corrupt PDFs shipped silently). A happy-path assertion cannot tell "passes because the document is good" from "passes because the check is broken", so `tests/ats-quality.test.ts` pairs checks with cases that must fail.

**`bun run reevaluate` is the machine gate, and it is composed of the other modules** — it always recompiles a Typst source so imported template/design-system changes cannot leave a stale PDF, then runs page-count (CV=2, CL=1), 192-PPI raster layout safety (10-mm edge band plus text/rule-collision detection), ATS text-layer checks from `scripts/verify-ats.ts`, and naming. It exits non-zero with fix hints. The `--allow-missing-ats` escape hatch is only for a clearly labelled local pilot: ATS remains unverified and the artifact is not submission-ready. See `docs/workflows/evidence-grounded-job-pilot.md`.

**Scoring is two independent weighted engines, both designed to be honest about missing data:**
- `scripts/match/score-job.ts` → 0-100 fit: skills 40 / experience 25 / sector 15 / location 10 / language 10. Missing inputs score a documented *neutral* value recorded in the result's `neutral[]` array rather than being penalized or inflated.
- `scripts/match/template-engine.ts` → template ranking over sector 0.25 / formality 0.20 / market 0.20 / role_fit 0.15 / seniority_fit 0.10 / profile_fit 0.10, reading `templates/*/*/meta.json`. A Hebrew/RTL posting hard-zeros any template lacking the `rtl_support` feature.

**Templates.** Typst templates compile against `templates/design-system.typ` (shared color/font/spacing tokens — edit tokens there, not per-template). Each template dir carries a `meta.json` whose `sectors`/`markets`/`formality`/`style`/`features`/`assets` fields are exactly what the template engine scores; a new template is not selectable until its `meta.json` is filled in, and a `meta.json` without a built `template.typ` is reported as a stub.

**CV conventions are per-country data, not per-country prose.** `src/market-profiles.ts` holds 15 markets (photo, personal details, page count, language, ordering, sources) and feeds two consumers from one definition: template scoring in `template-engine.ts`, and the drafting prompt via `conventionsBlock()` in `buildApplicationBrief()`. A skill would only reach the second. Inspect with `bun run markets table|show <code>|detect --job f`. Templates declaring the coarse region (`markets: ["eu"]`) still match every European country, so adding a market never silently demotes one. A posting always overrides the profile — an explicitly stated working language beats the market default.

**Personal data is blocked, not sanitised.** `bun run scan-personal-data` (tracked files / `--staged` / `--history`) refuses real emails, international phone numbers and LinkedIn URLs; it runs as a pre-commit hook and, with the full gate set (`bun run gates`), as a pre-push hook — both enabled by `bun run hooks:install`. **Do not rely on GitHub Actions here:** this repo is private, so Actions bills against a minutes allowance, and runs have been refusing to start since 2026-07-18 on a billing failure. The workflows are correct and will work once that is resolved; until then the local hooks are the only layer that actually executes. Placeholders belong in `ALLOWED` in `scripts/scan-personal-data.ts` — add to it rather than weakening a pattern, and never paste a real contact detail into a fixture. Real values live in `data/profile.json`, which is gitignored.

**Inputs and scratch.** Job descriptions you feed the tooling go in `data/jd/`, ad-hoc scripts in `data/scratch/` — both gitignored. Do not leave postings, CV drafts, or scratch at the repo root: the ignore rules there are name-shape guesses, and an ad-hoc filename will slip through and get committed.

**State.** `data/tracker.db` is SQLite in WAL mode via `src/tracker.ts` (`applications` + `document_versions`; status is a CHECK-constrained enum, `content_hash` is UNIQUE for dedup, updates go through a column allowlist). Tests must point `TRACKER_DB` at an isolated file so they never contend with a running CLI/MCP process. Other runtime state: `data/profile.json` (Zod-validated, `src/profile-schemas.ts`), `data/seen-jobs.json` (scrape dedup), `data/pipeline-state.json` (resume).

**`jobsearch` (`src/jobsearch/`, entry `scripts/jobsearch.ts`) is the agent-first CLI**, built to the CreateCLI-Agent contract. `src/jobsearch/commands.ts` + `hosts.ts` hold the command table — the single source of truth for argument parsing, `--help-json`, the generated MCP tools (`mcp.ts`) and the plugin doc tests. It imports scoring/template/market/project modules directly; the application pipeline, gate and scraper are delegated to the existing CLIs (`src/jobsearch/toolmap.ts`, bundled as one `dist/tools.js`). Contract v2: stdout is always one compact `{"ok":true,"data":…}` / `{"ok":false,"error":{code,type,message,recoverable,suggestions}}` envelope (NDJSON for `rank`); stderr is diagnostics only; exits 0 ok · 1 negative verdict · 2 usage/validation/confirmation · 3 not found · 5 conflict · 10 dry-run · 20 external/unavailable · 30 internal; mutations refuse without `--yes` and preview with `--dry-run`. Changing an exit code or envelope field is a breaking change — bump `CONTRACT_VERSION`. Every call appends `{command, exit, ms, bytes}` (never arguments) to `<workspace>/data/state/agent-calls.jsonl`; `JOB_SEARCH_TELEMETRY=0` disables it.

**`src/paths.ts` decides where things live.** `CODE_ROOT` (templates, tools) is the checkout or the installed plugin; `WORKSPACE` (personal data, same `data/` + `assets/` layout as a checkout) is `JOB_SEARCH_HOME`, else the checkout, else `~/.local/share/job-search` — never a host's plugin-data dir, which Claude Code deletes on uninstall. No other module may do `import.meta.dir` path math (`tests/paths.test.ts`); a bundled build moves the code and relative math then points at directories that silently do not exist.

**Agent surfaces.** `jobsearch mcp` (registered by the plugin, and by `opencode.json` in this repo) serves seven tools generated from the command table — writes only through `jobsearch_write` with `confirm: true` — plus the `tailor_application` prompt; the previous `scripts/mcp/server.ts` stays available as `bun run mcp` for one release; `scripts/api/server.ts` exposes 9 REST endpoints plus the dashboard, with timing-safe `API_KEY` comparison and 127.0.0.1 binding. Both are read-mostly: the only writes are `add_application` and `update_application_status`, each requiring a literal `confirm: true` in the schema.

## Hard rules

1. **Never fabricate profile data.** Skills, experience, achievements come from `data/profile.json` / `get_profile` only. Gaps stay visible; never inflate a fit score, never keyword-stuff a CV.
2. **Confirm-gated writes need a human yes in-conversation first** — `confirm: true` is a schema requirement, not the confirmation itself.
3. **Never commit personal data.** `data/profile.json`, `data/seen-jobs.json`, `data/tracker.db`, and everything under `assets/applications/` are gitignored deliberately. Never force-add them.
4. **Verify company-specific claims independently** via WebFetch/WebSearch before they enter a document — do not trust a reviewer agent's research unchecked.
5. **Mention Claude Code by name** whenever a CV or cover letter references agentic coding or AI tooling.
6. Typecheck + tests pass before any commit. Conventional Commits.

## Workflow for New Job Applications

1. User provides a job posting (URL or text).
2. **Always evaluate fit first** — skills, experience, behavioral/culture. Present the assessment before drafting anything.
3. If good fit: draft CV + cover letter into one grouped folder per application (`bun run naming show` for exact paths).
4. **Verify both documents** — machine gate, then the checklist below.
5. Prepare interview talking points from the role requirements and the candidate's strengths.

`/job-search:apply` is a thin adapter over the `cv` skill (see `job-search/commands/apply.md`). The optional content reviewer is the plugin's tool-less `reviewer` agent: it receives the drafts **inline in the prompt** and is scoped to content critique, not typesetting.

## Verification Checklist

Re-read the generated file and verify **all** of the following before presenting. Report results as a pass/fail checklist.

**Machine gate first:** for a submission-ready document, `bun run reevaluate --company "<Company>" --role "<Role>"` must exit 0 with every gate passing. `--allow-missing-ats` is allowed only for an explicitly non-shipping local pilot; report ATS as unverified and never treat that output as ready to submit.

### Factual accuracy
- [ ] All claims match the actual profile — no fabricated skills, experience, or achievements
- [ ] Job titles, dates, company names, locations, and contact details are correct
- [ ] Company-specific claims (partnerships, products, technology, expansions) independently verified

### Targeting
- [ ] Profile statement / opening paragraph is tailored to this role, not generic
- [ ] Skills and experience bullets reframed to match the job requirements
- [ ] Key requirements addressed, gaps acknowledged where relevant; nice-to-haves highlighted where genuinely matched

### Consistency & quality
- [ ] CV in the standard 2-page format; cover letter in the established structure; tone consistent across both; no contradictions
- [ ] No syntax errors (balanced braces / valid Typst), no spelling or grammar errors
- [ ] Agentic coding / AI tooling references name **Claude Code**
- [ ] Cover letter addressed to the correct person, or "Dear Hiring Manager" if unknown

### Compiled PDF verification (MANDATORY — never skip)
Both documents MUST be compiled and visually inspected after the final `reevaluate` run. "Looks fine in the source" is not acceptable — imported-template and page-break decisions are unpredictable. Iterate until:
- [ ] **CV is exactly 2 pages** — not 1, not 3. **Cover letter is exactly 1 page**, signature block included
- [ ] Raster layout gate passes: no ink inside the 10-mm edge safety band and no detected text/rule collision
- [ ] No orphaned entry titles, raw Typst markup, overlap, clipping, or broken wrapping in the final rasterized pages
- [ ] Header retains literal email/phone/location and compact visible LinkedIn/Website labels when those profile URLs exist
- [ ] Languages are rendered from `identity.languages` without invented proficiency levels
- [ ] LaTeX path only: CV compiled with **lualatex** (pdflatex fails on modern MiKTeX with fontawesome5 font-expansion errors), cover letter with **xelatex** (cover.cls needs fontspec)
- [ ] LaTeX path only: **cover letter bullet font matches body font** — `\lettercontent{}` must not wrap `\begin{itemize}` (its trailing `\\` errors on `\end{itemize}`, and moving itemize outside loses Raleway). Close `\lettercontent{}`, then `{\raggedright\fontspec[Path = OpenFonts/fonts/raleway/]{Raleway-Medium}\fontsize{11pt}{13pt}\selectfont \begin{itemize}...\end{itemize}\par}`

### ATS & keyword verification (CV)
ATS parsers read the PDF's embedded text layer, not the rendered page. Extract with `pdftotext -layout`; without Poppler this is a hard shipping blocker, not a visual substitute.
- [ ] Text layer extracts cleanly — no `(cid:*)` markers, no `�`, nothing visible in the PDF but absent from the extraction
- [ ] Email and phone appear as **literal text** (icon-glyph noise like `MOBILE-ALT` is harmless; a contact detail carried only by an icon or hyperlink is invisible to ATS)
- [ ] Reading order of the extraction matches visual order (single-column is safe; multi-column custom templates are where this breaks)
- [ ] Posting keywords covered or honestly absent — tighten synonym-only matches to the posting's exact term where truthful, add keywords the profile genuinely supports, leave real gaps visible and **never stuff**
