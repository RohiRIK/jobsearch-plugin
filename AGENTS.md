# Agent Instructions — AI Job Search Workspace

This repo is a job-application workspace for its owner. If you are an autonomous agent (OpenCode, OpenClaw, Hermes, or anything MCP-capable), read this before acting.

## Your surfaces

The user speaks to an AI agent; the agent runs the CLI internally. Do not make
the user execute project commands as a workflow step. CLI commands in the docs
are the agent's implementation surface, not user instructions.

- **Plugin**: `job-search/` — one self-contained package for Claude Code, Hermes, OpenCode, OpenClaw and Pi (skills `init`, `research`, `cv`, `outcome`, `manage`, plus the synced skill factory). Install on a host with `job-search/scripts/jobsearch hosts-install --host <host> --dry-run`, then `--yes` after explicit approval; see `docs/AGENTS-INTEGRATION.md`.
- **Agent CLI**: `jobsearch <command>` (from a checkout: `job-search/scripts/jobsearch` or `bun run jobsearch`) — one JSON envelope per call, semantic exit codes, `--help-json` for discovery. Start with `jobsearch status`; triage with `jobsearch triage --job f` / `jobsearch rank` instead of chaining `score`/`select-template`/`markets`/`projects`. Writes need `--yes` after a human yes; `--dry-run` previews with exit 10. `jobsearch run <tool> …` reaches every single-purpose tool.
- **MCP server**: `jobsearch mcp` (stdio) — seven tools generated from the CLI table; writes go through `jobsearch_write` with `confirm: true`. Registered by the plugin for Claude Code and Hermes, and by `opencode.json` for OpenCode in this repo. The previous 15-tool server is `bun run mcp` for one more release.
- **CLI pipeline**: `bun run <script>` — maintainer scripts in a checkout; see `package.json`.
- **Router skill**: `.agents/skills/job-search-assistant/SKILL.md` — for hosts that read `.agents/skills`; routes to the plugin skills.

## Hard rules (all agents)

1. **Never fabricate profile data** — skills, experience, achievements come from `get_profile` / `data/profile.json` only. Gaps stay visible; no inflating fit scores.
2. **Writes need explicit user confirmation** — `add_application` and `update_application_status` require `confirm: true`; get a human yes in-conversation first.
3. **Tailored CV / cover letter generation follows the shared skill workflow**: collect a traceable posting, score capability fit separately from work eligibility, prepare an evidence contract, draft with the host LLM, review until clean, render, run reevaluation, and inspect every rasterized final page. Claude Code's `/apply` is a thin adapter to that workflow; other agents use the shared skill or `tailor_application` MCP prompt. `bun run cover-letter` remains a heuristic fallback. See `docs/workflows/evidence-grounded-job-pilot.md`.
4. **Don't commit personal data** — `data/profile.json`, `data/seen-jobs.json`, tracker DB, and generated documents are gitignored on purpose. Never force-add them.
5. **Verify with tools, don't assume** — `bunx tsc --noEmit` and `bun test tests/` must pass before any commit.
6. **Document naming is enforced** — generated CVs/cover letters must be named `<Name>_<Company>_<Role>_<CV|CL>.<ext>` (no spaces; `src/naming.ts` owns the convention). Check with `bun run naming check`; print correct names with `bun run naming show <company> <role>`.
7. **Documents must pass the reevaluation gate before they ship** — `bun run reevaluate --company X --role Y --market <code>` always recompiles current Typst source/imports, then gates the selected market's CV page budget (cover letter = 1), 192-PPI raster layout safety, ATS text layer, and naming. It exits 1 with fix hints until green. `--allow-missing-ats` is an explicitly non-shipping local-pilot exception; report ATS as unverified. Never present an artifact as submission-ready without a passing ATS gate.

## Repo map

`src/` shared modules (schemas, tracker, naming, document contracts, portfolio templates) · `scripts/` TypeScript CLIs (Bun) · `data/` runtime data (JSON, SQLite) · `templates/` Typst CV/cover templates + portfolio HTML templates · `tests/` Bun test suite · `docs/` reports, prompts, planning · `.claude/commands/` Claude Code adapters · `.agents/skills/` portal scraper CLIs + shared agent skill · `assets/applications/<Company>/<Date>/` grouped per-application CV+cover-letter output (personal, gitignored); `assets/cv/`, `assets/cover_letters/` source templates.
