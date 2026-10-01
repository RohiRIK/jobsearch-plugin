# Job-search integration — Claude Code, Hermes Agent, OpenCode, OpenClaw, Pi

This repository ships one plugin: `job-search/`. It is self-contained — the toolchain is bundled in `job-search/dist/`, templates in `job-search/templates/` — so it works when copied into any host's plugin cache, with nothing from the checkout. Personal data lives outside it, in the workspace (`JOB_SEARCH_HOME`, else the checkout's `data/` when you run from a checkout, else `~/.local/share/job-search`).

Every host format below is checked against that host's own source or docs in [`docs/planning/host-contracts.md`](planning/host-contracts.md).

## What the plugin contains

| Part | Path | Read by |
|---|---|---|
| Hermes manifest (Agent Plugins v1) + MCP | `plugin.json`, `mcp.json` | Hermes Agent |
| Claude Code manifest + MCP + data-folder setting | `.claude-plugin/plugin.json`, `.mcp.json` | Claude Code, claude.ai, Cowork |
| Pi package | `package.json` (`pi.skills`) | Pi |
| Skills | `skills/{init,research,cv,outcome,manage}` + synced `create-skill`, `create-cli-agent`, `create-plugin` | every host |
| Commands, agent | `commands/*.md` (`/job-search:apply`, …), `agents/reviewer.md` | Claude Code |
| Launcher | `scripts/jobsearch` (not `bin/`: claude.ai and Cowork refuse plugins with a top-level `bin/`) | every host |
| Bundle | `dist/jobsearch.js` (CLI + MCP), `dist/tools.js` (22 single-purpose tools), `dist/portals/*.js` | launcher |

## Install

Preview first, then apply after a human yes. `jobsearch hosts-install` refuses (exit 5) to replace any skill, link or MCP entry it did not create, and `hosts-uninstall` removes only what it created.

| Host | Install | Verify |
|---|---|---|
| Claude Code | `claude plugin marketplace add RohiRIK/jobsearch-plugin` then `claude plugin install job-search@rohirik` (or `jobsearch hosts-install --host claude --dry-run`). In this repo, `.claude/settings.json` already declares the marketplace and enables the plugin; for live edits use `claude --plugin-dir ./job-search`. | `claude plugin validate ./job-search --strict`; `claude plugin details job-search` |
| Hermes Agent | `jobsearch hosts-install --host hermes [--scope profile:<name>] --dry-run`, then `--yes`. Links each skill as `job-search-<skill>`, merges `mcp_servers.job-search` into `config.yaml` (never a duplicate key). Validation only: `hermes plugins doctor ./job-search` checks the package; it does not activate it. | `jobsearch hosts-doctor` |
| OpenCode | In this repo: the `.agents/skills/job-search-assistant` router plus `opencode.json`. User-level: `jobsearch hosts-install --host opencode --dry-run`, then `--yes` (plain-name skill links, `mcp.job-search` merged into `~/.config/opencode/opencode.json`). | `opencode mcp list`; `jobsearch hosts-doctor` |
| OpenClaw | `jobsearch hosts-install --host openclaw --dry-run`, then `--yes` (links `job-search-<skill>`; registers MCP when the `openclaw` CLI exists, otherwise says it skipped). | `openclaw mcp probe job-search` |
| Pi | `pi -e ./job-search` for one session, or `jobsearch hosts-install --host pi --yes` (adds the plugin dir to `~/.pi/agent/settings.json` packages). Pi has no core MCP; skills use the CLI. | `/reload` in Pi |
| Anything else with MCP | `jobsearch hosts-install --host mcp` prints the stdio entry to paste | the host's MCP list |

Non-Claude installs also put a `jobsearch` shim in `~/.local/bin`. From a checkout, run the launcher as `job-search/scripts/jobsearch`. The old `.agents/install/hermes.sh` and `openclaw.sh` are now thin wrappers around `hosts-install`, kept for one release.

## MCP server

`jobsearch mcp` serves tools generated from the CLI's command table, with the same `{ok, data | error, exit}` envelope:

| Tool | What |
|---|---|
| `jobsearch_status`, `jobsearch_triage`, `jobsearch_rank`, `jobsearch_prepare`, `jobsearch_gate` | the high-traffic commands, typed |
| `jobsearch_run` | every other read-only command (`command: "help"` returns all flags) |
| `jobsearch_write` | commands that write (`tracker-add`, `tracker-status`, `render`, `data-*`, `hosts-*`); requires `confirm: true` after a human yes; `dry_run: true` previews |

Named tools accept `posting_text` instead of a file path for hosts without filesystem access. Also served: resource `jobsearch://reports/latest` and the user-invoked `tailor_application` prompt (the host LLM drafts; the server never picks a provider). There is no generic shell, delete or profile-mutation tool. Seven tools, about 4.6 KB of schema (was 15 tools, 12.1 KB).

The previous 15-tool server remains `bun run mcp` in a checkout for one release, for registrations that still point at `scripts/mcp/server.ts` (its tools include `prepare_application` and `review_application_draft`).

## REST / auth

`bun run api` serves the dashboard at `/` and `GET /api/profile`, `/api/jobs`, `/api/applications`, `/api/analytics`, `/api/reasoning`, `POST /api/applications`, `POST /api/score`, and `PATCH /api/applications/:id`. By default it binds `127.0.0.1:8317`; Docker sets `HOST=0.0.0.0` inside the container and host mapping remains localhost. Set `API_KEY` to require `x-api-key` for `/api/*` (timing-safe comparison). Without it, local API calls are unauthenticated. Do not expose this service publicly without your own access controls.

## Security posture

MCP is local stdio and inputs are validated against the command table; writes need `confirm: true` (MCP) or `--yes` (CLI) after a human yes, and preview with a dry run. Host installs never replace what they did not create. REST has a separate auth model: `API_KEY` is necessary if other local processes are not trusted; it is not a substitute for network isolation. The plugin contains no personal data (`tests/plugin-bundle.test.ts` checks the bundle); profile, tracker and documents stay in the workspace. Rendering and submitting documents are separate human-reviewed actions.

## Workflow

Read the selected `job-search/skills/<name>/SKILL.md` for the operative instructions. The application flow is provider-neutral: `jobsearch triage`, `jobsearch prepare`, draft with the host LLM, `jobsearch review` until clean, `jobsearch render --yes` after the user picks a layout, then `jobsearch gate` and visual inspection of every rasterized page before presenting anything as submission-ready. A missing ATS or raster check is a failure, never a pass. The plugin is profile-agnostic: no Hermes profile name, workspace path or personal fact is stored in it.
