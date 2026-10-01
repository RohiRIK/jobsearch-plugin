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

Details, verification and uninstall per host: [`docs/AGENTS-INTEGRATION.md`](../docs/AGENTS-INTEGRATION.md). Your data stays in your workspace (`jobsearch data-where`), never in the plugin directory, so upgrading or uninstalling cannot touch it.

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
