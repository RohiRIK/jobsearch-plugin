# job-search plugin

Evidence-grounded job search for AI agents: onboard a profile, find and triage roles, draft market-aware CVs and cover letters that pass a machine gate, record outcomes — and a `manage` skill for running and extending the system itself. One package for Claude Code (also claude.ai and Cowork), Hermes Agent, OpenCode, OpenClaw and Pi; MCP for any other host.

It is self-contained: the toolchain is bundled in `dist/`, so it needs only [Bun](https://bun.sh) — no repository checkout. Document compilation and the shipping gate also need `typst` and Poppler (`pdftotext`, `pdfinfo`); `jobsearch status` reports what is missing.

## Install

```bash
# Claude Code
claude plugin marketplace add RohiRIK/jobsearch-plugin
claude plugin install job-search@rohirik

# Hermes, OpenCode, OpenClaw, Pi, generic MCP — preview, then apply
job-search/scripts/jobsearch hosts-install --host hermes --dry-run
job-search/scripts/jobsearch hosts-install --host hermes --yes
```

### Names per host

| Host | Install name | Why |
|---|---|---|
| Claude Code | `job-search@rohirik` (skills as `/job-search:*`) | Unchanged since 2.0: Claude Code keys installs by `plugin@marketplace`, so renaming would break every existing install |
| Hermes Agent | `jobsearch` (`plugin.json`) | The Hermes catalog key `job-search` belongs to an unrelated plugin |
| OpenClaw | `jobsearch` (`openclaw.plugin.json`, npm name `@rohirik/jobsearch`) | Same name as Hermes |

The MCP server is called `job-search` on every host, so tool names and existing `hosts-install` registrations do not change.

Details, verification and uninstall per host: [`docs/AGENTS-INTEGRATION.md`](../docs/AGENTS-INTEGRATION.md). Your data stays in your workspace (`jobsearch data-where`), never in the plugin directory, so upgrading or uninstalling cannot touch it.

## Before you install

What this plugin does on your machine, so you can decide before installing:

- **Network calls to job boards (scrapers).** Research commands fetch public listings from AllJobs, Drushim, JobMaster, RemoteOK, Remotive, We Work Remotely and Arbeitnow (`dist/portals/*.js`), only when you or the agent run a search. No account, cookie or credential is used. In a repository checkout, profile import (`bun run profile:*`) can also fetch your public GitHub profile, your blog or RSS feed, and a LinkedIn profile page you give it by URL; the plugin bundle does not ship those fetchers.
- **Shell commands.** The MCP server and skills run `scripts/jobsearch` (Bun) and the bundled tools as subprocesses. Rendering and the shipping gate run `typst` and Poppler (`pdftotext`, `pdfinfo`); backup runs `tar`. `hosts-install` (opt-in, `--dry-run` first, then `--yes`) edits the chosen host's config to register the skills and MCP server and can run that host's CLI (for example `openclaw mcp add`); it refuses to replace anything it did not create.
- **A binary download, only on request.** `jobsearch tools-install --tool typst --yes` downloads the official Typst 0.13.1 release archive from `github.com/typst/typst/releases`, checks it against a SHA-256 pinned in the source, and places the binary in `<workspace>/data/tools/bin`. Nothing is downloaded at install time and nothing replaces the plugin's own files.
- **Native npm dependency.** The raster layout check uses `@napi-rs/canvas` (prebuilt native module from npm). The bundled plugin does not install it; without it that one check reports itself unavailable. A repository checkout gets it from `bun install`.
- **Local REST API (repository checkout only).** `bun run api` serves a dashboard and REST API on `127.0.0.1:8317` (optional `x-api-key`). It is not part of the plugin bundle and never starts by itself.
- **Your data stays in a workspace outside the plugin.** Profile, tracker, drafts and generated documents live in `$JOB_SEARCH_HOME`, else `${XDG_DATA_HOME:-~/.local/share}/job-search` (`jobsearch data-where` prints it). The plugin reads and writes there and in your temp directory, and reads files you point it at (a CV, a job description).
- **Local usage log, opt-in, never sent.** Each CLI call appends command name, exit code, duration and output size (no arguments) to `<workspace>/data/state/agent-calls.jsonl` for the `manage` skill's audit, **only when you opt in with `JOB_SEARCH_TELEMETRY=1`**. It is off by default (unset or any other value). Unknown commands are logged as `<unknown>`. Nothing is reported to any server.
- **No stored credentials, no background processes.** The MCP server runs only while the host keeps it open.

## Skills

| Skill | Use it to |
|---|---|
| `init` | Set up the workspace and profile, and prove the toolchain works |
| `research` | Find, triage and rank roles; country CV conventions; skill-gap plans |
| `cv` | Draft one application end to end, through review, render and the gate |
| `outcome` | Record results and turn patterns into profile suggestions |
| `manage` | Health checks, host installs, data backup/migration, audits, extending, releasing |
| `create-skill`, `create-cli-agent`, `create-plugin` | The skill factory, synced from [RohiRIK/skills](https://github.com/RohiRIK/skills) (`skill-sync.json` pins the commit) |

Claude Code also gets commands — `/job-search:apply`, `/job-search:rank`, `/job-search:setup`, `/job-search:expand`, `/job-search:reset`, `/job-search:add-portal`, `/job-search:add-template` — and a tool-less `reviewer` agent for content critique.

## The CLI

Everything runs through `scripts/jobsearch`: one compact JSON envelope per call, semantic exit codes (0 ok, 1 negative verdict, 2 usage/confirmation, 3 not found, 5 conflict, 10 dry-run, 20 unavailable), and `--help-json` for the full schema. Writes need `--yes` and preview with `--dry-run`. `jobsearch mcp` serves the same commands as seven MCP tools. `jobsearch run <tool> …` reaches the 22 single-purpose tools (`markets`, `outcome`, `reason`, …).

## Developing

Edit the sources in the repository root (`src/`, `scripts/`, `templates/`), then `bun run plugin:build` — `dist/` and `templates/` here are generated and committed, and `bun run plugin:check` (part of `bun run gates`) fails when they are stale. Validate with:

```bash
claude plugin validate ./job-search --strict
hermes plugins doctor ./job-search        # validation only; does not activate the plugin
pi -e ./job-search
bun test tests/job-search-plugin.test.ts tests/plugin-bundle.test.ts tests/hosts.test.ts
```

Never fabricate profile facts or bypass the confirmation and document gates in the selected skill.
