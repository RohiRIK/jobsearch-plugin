# Audit Report — AI Job Search Workspace

Date: 2026-07-10. Every finding below was verified against a tool run in this session; fixes were re-verified after applying (tsc + smoke test + 25-test suite).

## Audit Summary

### Critical Issues

- **[scripts/profile/merge.ts:261] Profile pipeline broken end-to-end → FIXED.** `fetch-github.ts` writes a flat staging JSON (`{name, bio, email, github, repos, languages}`) while `merge.ts` only reads an `identity`-wrapped shape. Worse, `languages` is a `Record<string, number>` and `allLanguages.push(...record)` threw a TypeError that an empty `catch {}` silently swallowed — the entire github staging file was skipped every run. Result: `profile.json` had `identity: {languages: []}`, 0 skills, and CLAUDE.md stayed a `[YOUR_NAME]` placeholder. Fix: `normalizeStaging()` maps the flat github shape into identity + a "Programming Languages" skill category; the languages push is now type-guarded; the catch now emits a `STAGING_SKIPPED` warning to stderr. Verified: merge now produces name "Rohi Rikman" + 8 skills, and sync-claude propagates them.

### High Issues

- **[scripts/build/cli.ts:284] `bun run pipeline` is a dry run** — every step printed `⏭` and did nothing → addressed by the new `scripts/pipeline/cli.ts` orchestrator (see INTEGRATION-REPORT.md). Old command left untouched for backwards compatibility.
- **[scripts/profile/feedback.ts:289] `suggest --apply` never applied anything** — `saveProfile()` was defined but never called; `--apply` only flipped `applied: true` flags. The reasoning loop was not closed → wired into `pipeline:reason` (analyze → feedback → merge → sync). Profile content changes still require human review by design; the chain now runs end-to-end and surfaces suggestions.
- **[.agents/skills/*-search] Scrapers disconnected from everything** — stdout-only, nothing consumed them; `data/seen-jobs.json` dedup store existed only as a Zod schema → `pipeline:scrape` now runs portals, normalizes output (handles `{meta, results}` wrapper), dedups by URL, persists `data/seen-jobs.json`. Verified live: 30 jobs captured from AllJobs, second run deduped to 0.
- **[scripts/profile/fetch-github.ts:134] No GITHUB_TOKEN support** — unauthenticated calls hit 403 rate limits (reproduced) → `Authorization: Bearer` from env added.

### Medium Issues

- **[scripts/profile/merge.ts:153] Prototype pollution in `deepMerge`** — no `__proto__`/`constructor`/`prototype` guard on keys from semi-external JSON → guard added.
- **[scripts/profile/fetch-github.ts:147] Unencoded username in API URL** → `encodeURIComponent` added.
- **[templates/] 4 of 7 template dirs have `meta.json` but no `template.typ`** (assets/cv/academic, assets/cv/creative, assets/cv/modern, cover/casual, cover/modern) — selecting them fails. Not fixed (creating real templates needs design decisions) — documented in AUDIT-RECOMMENDATIONS.md (this directory).
- **[scripts/, data/] Zero tests for the core toolchain** (only scraper CLIs had tests) → `tests/` added: 25 tests across merge normalization, JD summarizer, match scorer, tracker CRUD + document versions, follow-ups. All pass.

### Low Issues

- **~84 `console.log` calls** in `scripts/build/cli.ts`, `scripts/tracker.ts`, `scripts/templates.ts`, `scripts/select-template.ts`, `data/migrate-csv.ts`, `scripts/verify-ats.ts` — human-readable output, violates the Tier 1 convention but is the established interface of those tools. Left as-is (changing could break piped consumers); all *new* tools use `process.stdout.write`.
- **3 `: any`** in `.agents/skills/jobindex-search/cli/src/helpers.ts:86,117,151` — scraper-local, untouched.
- **`data/tracker.ts:147`** — `update()` interpolates column names from caller keys. Safe from typed internal callers; add an allowlist if ever exposed to untrusted input.
- SSRF-shaped fetch in `fetch-blog.ts` (owner-supplied URL, local tool) and missing `--` separators before path args to `pdftotext`/`unzip` — acceptable for the single-user threat model, listed for completeness.

## Answers to the 12 Audit Questions

1. **Does the profile pipeline work end-to-end?** It does now. It did not before this session (see Critical). Remaining gap: only the github source is staged — experience/education are empty until a real CV or LinkedIn export is provided (R1).
2. **Is the reasoning loop closed?** Structurally yes via `pipeline:reason`; the analyze → suggest → merge → sync chain runs and exits 0. Profile mutation from suggestions stays human-gated (feedback.ts's own design: "Profile changes require manual review").
3. **Are the skills triggerable?** Descriptions in `.claude/skills/*/SKILL.md` match use cases and carry trigger keyword lists (verified by reading; no runtime test exists for routing).
4. **What's missing from the data model?** `compensation`/salary expectations, `network` (referral contacts), follow-up dates (worked around via notes stamp), interview rounds detail. Additive schema work — recommendations.
5. **Is the Typst template production-ready?** `banking` CV + `classic` cover compile successfully (verified via `pipeline:docs`, 2/2 success). Page-count assertion and visual check remain manual. The other 4 template dirs are stubs.
6. **Are the Israeli scrapers working?** AllJobs verified live (30 real jobs returned, Hebrew titles parse). Drushim/JobMaster not exercised this session — same invocation pattern, needs a live check.
7. **What would make this 10x more useful?** Closing the LLM gap: the CLI layer now parses/scores/tracks mechanically, but tailored CV bullets, cover letter prose, and interview prep are Claude-skill work. The REST API (`bun run api`) is the substrate for that + the Hermes/OpenClaw agent integration the user wants next.
8. **Is the naming convention right?** `data/naming.ts` is consumed by the build CLI and handles company/role slugs; fine for current use. Multi-language documents would need a locale suffix.
9. **Dead code paths?** `feedback.ts:saveProfile()` (now the loop's documented manual step), `job_scraper/` dir (empty, unused), 4 template stubs. `scripts/build/cli.ts cmdPipeline` remains as a dry-run shim superseded by `pipeline:*`.
10. **Test strategy?** Minimum viable suite now exists (25 tests, pure-logic units + tracker against temp DBs). Next: scraper output-shape contract tests, sync-claude section regeneration test.
11. **How well do tools integrate?** Was: 5 disconnected islands. Now: scrape→seen-jobs→(score)→tracker→outcome→reason→feedback→merge→sync-claude traceable; `data/pipeline-state.json` records step status; each stage re-runnable. Break points left: scraper→score is manual (listings lack descriptions; scoring needs the posting text), and documents are compiled but not content-tailored (LLM work).
12. **Deployment infrastructure?** Added: `Dockerfile` (oven/bun, API server entrypoint), `docker-compose.yml` (app + on-demand scraper profile, `data/` volume), `.dockerignore` (excludes personal data). Not built/run in this session — Docker build unverified. No CI/CD (recommendation).

## What I Changed

| File | Change |
|------|--------|
| scripts/profile/merge.ts | normalizeStaging(), languages guard, stderr warnings, __proto__ guard, export main |
| scripts/profile/fetch-github.ts | GITHUB_TOKEN, encodeURIComponent, export main + guard |
| scripts/profile/*.ts (10 files) | `if (import.meta.main)` guards + exported main — importable without side effects |
| scripts/build/cli.ts | exported `compile()`, import.meta.main guard |
| data/tracker.ts | document_versions table + addDocumentVersion/listDocumentVersions |
| scripts/tracker.ts | `versions`, `version-add` subcommands |
| package.json | 12 new scripts (pipeline:*, dashboard, followup, summarize, score, api, test) |
| NEW scripts/jobs/summarize.ts | heuristic JD parser |
| NEW scripts/match/score-job.ts | 5-dimension fit scorer (0-100) |
| NEW scripts/followup.ts | follow-up pending/mark |
| NEW scripts/dashboard.ts | unified stats view |
| NEW scripts/pipeline/cli.ts | 6-command orchestrator with resumable state |
| NEW scripts/api/server.ts + public/index.html | REST API + web dashboard |
| NEW Dockerfile, docker-compose.yml, .dockerignore | containerization |
| NEW tests/*.test.ts (5 files) | 25 tests |

## What I Recommend

See AUDIT-RECOMMENDATIONS.md (this directory).
