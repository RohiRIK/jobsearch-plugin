# Integration Report

## What Was Disconnected

1. **Scrapers → everything.** 9 portal CLIs emitted JSON to stdout; nothing consumed it. `data/seen-jobs.json` existed only as a Zod schema. `job_scraper/` output dir: empty, unused.
2. **`bun run pipeline` was a dry run** — `scripts/build/cli.ts cmdPipeline` printed ⏭ for all 5 steps and executed nothing.
3. **Reasoning loop open** — `feedback suggest --apply` never wrote profile changes (`saveProfile()` dead code); nothing chained analyze → suggest → merge → sync.
4. **Two uncoordinated writers of profile.json** (merge from staging, feedback in place) — feedback's writes would have been silently lost on the next merge, had they existed.
5. **Tools not importable** — every CLI executed `process.exit(main())` at module top level; importing one ran it. "Import functions, don't shell out" was impossible.
6. **No state persistence** — interrupted multi-step runs restarted from zero.
7. **No JD parser** — raw job text couldn't become structured requirements.

## What I Fixed

| Wiring | How |
|--------|-----|
| Importability | `if (import.meta.main)` guards + `export main` on all 10 profile tools + build CLI; `compile()` exported |
| Master orchestrator | `scripts/pipeline/cli.ts` — imports functions directly (argv swapped around each call); scrapers are the documented exception (separate Bun projects with own node_modules → spawned) |
| Scraper → dedup → tracker path | `pipeline:scrape` runs portals, normalizes `{meta,results}`/array shapes, dedups by URL into `data/seen-jobs.json` (existing SeenJobsFile schema, now actually used) |
| Reasoning loop | `pipeline:reason` = reason analyze → feedback suggest --apply → merge → sync-claude, each step gated on the previous |
| Docs regeneration | `pipeline:docs [--company X]` compiles all .typ in assets/cv/, assets/cover_letters/, live templates; records document_versions rows |
| Weekly review | `pipeline:weekly` → `data/reports/weekly-YYYY-MM-DD.md` (applications, metrics, insights, action items) |
| Error recovery | every step's status persisted to `data/pipeline-state.json` immediately; `--resume` skips completed steps; failed steps don't kill unrelated ones (scrape continues across portals) |
| Job → tracked application | `pipeline:full --job <file>` = summarize → score → tracker insert (status planning, fit_rating = score, gaps in notes) → next-step guidance |

## Verified Data Flows (each exercised this session)

```
job.txt ──summarize──▶ ParsedJD ──score──▶ 35/100 + gaps ──track──▶ tracker.db (then cleaned up)
portals ──scrape──▶ 30 jobs ──dedup──▶ seen-jobs.json (rerun: 0 new ✓)
outcomes.json ──reason analyze──▶ reasoning.json ──feedback──▶ suggestions ──merge──▶ profile.json ──sync──▶ CLAUDE.md
*.typ ──pipeline:docs──▶ 2/2 PDFs compiled ──▶ document_versions rows
tracker+outcomes+reasoning ──weekly──▶ data/reports/weekly-2026-07-10.md
everything ──api──▶ GET/POST/PATCH on 127.0.0.1:8317 + web dashboard
```

## Still Broken / Needs Input

- Listing → score: scraped listings carry no description text; scoring a listing means fetching its detail page (portal CLIs have a `detail` command — wiring it is a next step, rate-limit sensitive).
- Tailored document *content* is LLM work — the /apply skill remains the quality path; `pipeline:full` says so in its output instead of pretending.
- Drushim/JobMaster untested live (R9). Docker build unverified (no build run this session).
- Profile experience/education empty until real CV/LinkedIn data staged (R1).

## New Commands

```
bun run pipeline:full --job <file> [--company X --title Y]
bun run pipeline:profile [--skip-github]
bun run pipeline:scrape --query "devops" [--portals alljobs,drushim]
bun run pipeline:reason
bun run pipeline:docs [--company X]
bun run pipeline:weekly
bun run dashboard [--format json]
bun run followup pending | mark <id>
bun run summarize --input job.txt
bun run score --input job.txt [--save]
bun run api [--port N]
bun run test
```

## Architecture (data flow, after)

```
                    ┌─ fetch-github ─┐
                    ├─ fetch-blog ───┤ staging/*.json ─ merge ─▶ profile.json ─ sync ─▶ CLAUDE.md
                    ├─ parse-cv ─────┤                    ▲
                    └─ linkedin ─────┘                    │
outcomes.json ─▶ reason ─▶ reasoning.json ─▶ feedback ────┘        (pipeline:reason)
portal CLIs ─▶ pipeline:scrape ─▶ seen-jobs.json ─▶ dashboard / api
job text ─▶ summarize ─▶ score ─▶ tracker.db ◀─ followup / versions / weekly
*.typ ─▶ pipeline:docs ─▶ PDFs + document_versions
tracker.db + json stores ─▶ dashboard.ts ─▶ api/server.ts ─▶ web UI
```
