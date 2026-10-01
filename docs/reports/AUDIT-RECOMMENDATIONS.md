# Audit Recommendations — Needs Your Decision

Ordered by impact. Nothing here was changed without you.

> **Status update (2026-07-10 production push):** R3 resolved (stubs kept as ranking candidates, flagged `available: false`, never auto-selected — see template intelligence engine). R6 resolved (CI workflow added). R7 reopened+resolved: job_search_tracker.csv exists at the repo root — `bun run migrate-csv` restored (scripts/migrate-csv.ts); run it when you want the history imported. R9 resolved (Drushim + JobMaster verified live, real results). Still yours: **R1** (real CV/LinkedIn data), **R2** (GITHUB_TOKEN), **R4** (point at Hermes/OpenClaw docs), **R5** (multi-language fonts/style), **R8** (schema additions — say the word).

## R1 — Feed the profile real experience data (highest impact, 15 minutes of your time)
`data/profile.json` has identity + 8 programming languages from GitHub, but **0 experience and 0 education** — so fit scoring runs degraded (experience dimension scores neutral) and CLAUDE.md's profile section is thin. `assets/cv/main_example.tex` is placeholder data; staging it would fabricate your profile. Options:
- Drop a real CV at `assets/cv/` and run `bun run profile:cv -- <path>` (LaTeX moderncv format), or
- Fill the LinkedIn manual template: `bun run profile:linkedin` prints instructions, then `bun run profile:merge && bun run profile:sync`.

## R2 — Set GITHUB_TOKEN
Unauthenticated GitHub API rate-limits from your machine (reproduced this session). Add `GITHUB_TOKEN` to `.env` (fine-grained, public-repo read-only scope) — `fetch-github.ts` now picks it up.

## R3 — Decide on the 4 stub templates
`templates/cv/{academic,creative,modern}` and `templates/cover/{casual,modern}` have meta.json but no template.typ. Either build them (each needs design decisions: fonts, layout, RTL) or delete the meta.json stubs so tools stop offering them. My recommendation: delete the stubs, add templates back when a concrete application needs one.

## R4 — Hermes agents + OpenClaw integration (your requested next feature)
You asked to enable "Hermes agents" and "OpenClaw" for this project. I could not verify what these refer to from this machine during the run, and wiring integrations against guessed interfaces violates the grounding rule. The workspace is now integration-ready for any agent framework: every tool is importable (no side effects), and the REST API (`bun run api`) exposes profile/jobs/applications/score/analytics as HTTP endpoints with optional `API_KEY` auth — which is the standard surface external agents consume. Next session: point me at the Hermes/OpenClaw docs or repos and I'll wire them against the API.

## R5 — Multi-language documents (Hebrew RTL, Danish)
High value for your IL/DK markets, real Typst work (bidi text, font selection, locale headers). Needs your font/style decisions before building. Ranked #11 in FEATURE-ASSESSMENT.md.

## R6 — CI/CD
No CI exists. Minimum useful: GitHub Actions running `bunx tsc --noEmit` + `bun test tests/` on push. Blocked on your decision because the repo pushes to a public remote and workflow files affect that surface.

## R7 — Migrate the CSV tracker history
`job_search_tracker.csv` exists at the repo root but `data/tracker.db` is empty. `bun run migrate-csv` imports it (dedup-safe, INSERT OR IGNORE). I did not run it — it changes your tracking data.

## R8 — Data-model additions (additive schema work)
- `compensation` field on profile (salary expectations, feeds scoring)
- `network` field (referral contacts per company)
- `follow_up_date` as a first-class tracker column (currently a notes stamp)

## R9 — Verify Drushim + JobMaster scrapers live
Only AllJobs was exercised end-to-end this session. Run `bun run pipeline:scrape --query "..." --portals drushim,jobmaster` once and check output; the shape normalizer handles `{meta, results}` and bare arrays, but portal-specific field names may need a mapping tweak.
