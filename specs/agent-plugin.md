# Agent plugin: one `jobsearch` tool, one plugin, every host

> **Status (2026-10-01): implemented** (AP0–AP6). Results, misses and what changed from this plan: `docs/reports/2026-10-01-agent-plugin-efficiency.md`. Deviations: the triage cache was measured and dropped (1.5 ms of a 105 ms call); per-tool bundles became one `dist/tools.js` behind `jobsearch run <tool>`; personal data keeps the checkout layout under the workspace (`<workspace>/data/…`, `<workspace>/assets/…`); jobindex/jobbank stay checkout-only (their CLI framework adds 7.7 MB); the entry-count and MCP-byte targets were missed and are explained in the report.

## What this builds

Turn the job-search toolchain into a **self-contained agent tool** that installs as **one plugin** on every agent host this repo already targets (Claude Code, Hermes Agent, OpenCode, OpenClaw, Pi), with MCP plus `AGENTS.md` as the fallback for any other host. The plugin also carries a **`manage` skill** for running, extending, installing and releasing the system, and the three skill-factory skills from `RohiRIK/skills` (CreateSkill, CreateCLI-Agent, CreatePlugin) so the system can extend itself wherever it is installed.

Three outcomes, in priority order:

1. **Deployable.** Installing the plugin is enough. No repo checkout, no `git rev-parse`, no per-call root resolution. Personal data lives outside the plugin and survives upgrades and uninstalls.
2. **Efficient.** Fewer model-visible entries, smaller tool schemas, one call where an agent makes five today, and a test that fails when any of these regress.
3. **Self-managing.** One skill knows how to check health, add a command or skill, install to a host, and cut a release, using the same gates a human would.

## Where it stands (measured 2026-10-01)

| Area | Today | Source |
|---|---|---|
| Plugin portability | `job-search/` skills run `bun run …` against the parent checkout. Its README says copying only `job-search/` elsewhere will not make the workflows executable. Claude Code copies marketplace installs into a cache and rejects paths that escape the plugin root, so today's plugin cannot work when installed. | `job-search/README.md`, Claude Code plugin docs |
| Root resolution | Every plugin skill opens with a `bun -e …realpathSync…` call to find the checkout, then sets the working directory on every later call. | `job-search/skills/*/SKILL.md` |
| MCP registration | `.mcp.json` / `opencode.json` run `sh -c 'exec bun run "$(git rev-parse --show-toplevel)/scripts/mcp/server.ts"'`, which only works inside the checkout. | `.mcp.json`, `opencode.json` |
| Model-visible entries | Claude Code in this repo: 19 skills/commands (7 `.claude/skills`, 8 `.claude/commands`, 4 plugin), ~4.7 KB of descriptions. Hosts reading `.agents/skills`: 14 more (~7.1 KB), mostly portal scrapers an agent should never call directly. Overlaps route the same request three ways (apply: `job-application-assistant`, `/apply`, `cv`; outcome: `/outcome`, `outcome`; scraper: two `job-scraper` skills). | measured |
| MCP surface | 15 tools + 1 prompt, 12.1 KB of tool schema. | measured via `listTools` |
| Triage cost | Up to 5 CLI calls (`summarize`, `score`, `select-template`, `markets`, `projects match`), ~12–13 KB of output. `jobsearch triage` (`bun run agent triage`, added in this branch) does it in 1 call, ~1.4 KB. | measured |
| Hard-coded roots | 43 `import.meta.dir`-relative path resolutions across 30 files. | `grep` |
| Bundle spike | `bun build scripts/agent.ts --target=bun` → one 218 KB file (22 modules) that runs anywhere Bun exists. `--compile` → 95 MB binary (too big to ship). The MCP server bundle is 0.88 MB plus 64 MB of `skia` `.node` files pulled in by the raster layout gate (`@napi-rs/canvas`). | spike |
| Silent failure | The bundled `triage`, run outside the checkout, resolved `templates/` to a non-existent directory and returned `"templates":{"cv":null,…,"warnings":[]}`: a silent wrong answer. | spike |

Facts from the official Claude Code plugin docs (read 2026-10-01) that shape the design:

- A plugin can declare its own MCP server in a plugin-root `.mcp.json`. `${CLAUDE_PLUGIN_ROOT}` expands in MCP `command`/`args`/`env`, hooks, and skill/command/agent Markdown bodies.
- `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`) persists across updates but **is deleted on uninstall** unless `--keep-data` is passed.
- A top-level `bin/` puts executables on the Bash tool's `PATH`, but **claude.ai and Cowork refuse to install a plugin that has `bin/`**.
- Components are namespaced: skill `cv` becomes `job-search:cv`, and `/apply` becomes `/job-search:apply`.
- `userConfig` prompts on enable. A `directory` option is substituted via `${user_config.KEY}` into MCP env and skill bodies.
- A marketplace is `.claude-plugin/marketplace.json` with relative or `git-subdir` sources. Private repos work if the machine has git credentials. A manifest `version` pins users until it changes.
- `claude plugin validate --strict` checks manifests, paths and MCP entries. `claude plugin eval` runs cases with and without the plugin and reports the score difference (Δ) and a cost estimate.

## Target shape

```text
job-search/                         ← the plugin: self-contained, profile-free, what every host installs
  plugin.json                       Hermes (Agent Plugins v1)
  .claude-plugin/plugin.json        Claude Code (+ userConfig.data_dir)
  package.json                      Pi (pi.skills) and the single version source
  scripts/jobsearch                 launcher: resolves its own dir, execs `bun dist/jobsearch.js` (not bin/, see decision 5)
  dist/jobsearch.js                 bundled toolchain: CLI + MCP server (canvas external, lazy)
  dist/portals/*.js                 bundled portal scrapers (no per-portal node_modules)
  assets/templates/                 Typst templates + design system, copied at build
  .mcp.json                         job-search MCP via ${CLAUDE_PLUGIN_ROOT}/scripts/jobsearch mcp
  skills/
    init research cv outcome        existing workflows, slimmed, calling `jobsearch <command>`
    manage                          NEW: health, extend, hosts, release, audit, data
    create-skill create-cli-agent create-plugin   synced from RohiRIK/skills (pinned, generated)
  commands/                         thin Claude Code adapters (apply, rank, scrape, setup, outcome, …)
  agents/reviewer.md                /apply reviewer: content critique only, read-only tools
  evals/                            claude plugin eval cases

$JOB_SEARCH_HOME/                   ← personal data, never inside the plugin
  profile.json tracker.db seen-jobs.json config.json jd/ applications/ state/agent-calls.jsonl
```

One command table (`COMMANDS`, today in `scripts/agent.ts`) is the source of truth for CLI parsing, `--help-json`, the MCP tools, and the test that checks every command a skill names exists.

## Design decisions

1. **Ship a Bun bundle, not a compiled binary.** 218 KB that needs Bun beats 95 MB that doesn't. Bun is already a hard requirement. The bundle is committed under `job-search/dist/` because marketplace installs are a plain git copy with no build step. A freshness test rebuilds and compares, so a stale bundle fails the gate.
2. **Split code root from data root (`src/paths.ts`).** `assetRoot()` is where templates live (the plugin or the checkout). `dataHome()` is personal data: `JOB_SEARCH_HOME`, then Claude `userConfig.data_dir`, then the checkout's `data/` when running from a checkout (today's behaviour), then `${XDG_DATA_HOME:-~/.local/share}/job-search`. `cacheDir()` may use `${CLAUDE_PLUGIN_DATA}`; **personal data never does**, because uninstall deletes it. All 43 call sites move to this module, and a lint test forbids `import.meta.dir` path math anywhere else.
3. **Missing assets fail loudly.** An empty template registry, a missing `typst`, or a missing canvas is reported as `unavailable` with a fix hint, never as a quiet `null` and never as a pass. This is the same rule the ATS gate already follows.
4. **Native and heavy features are optional capabilities.** `@napi-rs/canvas` stays external in the bundle and is imported lazily, only by `gate`'s raster check. `typst`/`pdftotext`/`pdfinfo` keep resolving through `src/resolve-bin.ts`. Without them, `gate` exits non-zero with `unavailable`, so the document is not submission-ready.
5. **Launcher in `scripts/`, not `bin/`.** `bin/` would give Claude Code a bare `jobsearch` command, but it makes the plugin uninstallable in claude.ai and Cowork. Skills write `${CLAUDE_PLUGIN_ROOT}/scripts/jobsearch`, which Claude Code substitutes. Other hosts get a `jobsearch` shim on `PATH` from `jobsearch hosts-install`.
6. **Coarse MCP generated from the table.** Named tools for the high-traffic commands (`status`, `triage`, `rank`, `prepare`, `gate`), plus `jobsearch_run` for the long tail of read-only commands and `jobsearch_write` for mutations (still `confirm: true` after a human yes). `--help-json` serves the full schema on demand. Target: ≤ 7 tools, ≤ 4 KB. The `tailor_application` prompt and the reports resource stay.
7. **One model-visible skill tree.** The plugin is the only place a model discovers job-search skills:
   - `.claude/commands/*` move into `job-search/commands/` as thin adapters.
   - `.claude/skills/*` fold into the plugin skills as context files (the `job-application-assistant` 01–07 references go under `cv/`; `market-conventions` and `upskill` under `research/`; `profile-*` and `reasoning-log` under `init/` and `outcome/`).
   - Portal scrapers lose their `SKILL.md` and become `jobsearch scrape` sources.
   - `.agents/skills` keeps one router for hosts that read it.
8. **Skill-factory skills are synced, not hand-copied.** `bun run plugin:sync-skills` copies CreateSkill, CreateCLI-Agent and CreatePlugin (plus the CreateCLI context files CreateCLI-Agent references) from a pinned `RohiRIK/skills` commit. It:
   - renames them to kebab-case (`create-skill`, …), as the Hermes slug pattern `^[a-z0-9]+(-[a-z0-9]+)*$` requires;
   - rewrites library-only references (README index row, `~/.claude/state` telemetry, the `Prompting` skill) through a tested rewrite table;
   - appends an "In this plugin" footer carrying provenance and the agent-first sentence the plugin test requires;
   - records file hashes in `skills/.synced.json`. A test fails on hand edits and warns when the upstream checkout has moved past the pin.

   `RohiRIK/skills` stays canonical.
9. **Host installs are a tested command, not shell scripts.** `jobsearch hosts-list|hosts-doctor|hosts-install|hosts-uninstall --host claude|hermes|opencode|openclaw|pi|mcp --scope project|user|profile:<name>` follows the CreateCLI-Agent contract:
   - `--dry-run` shows the exact file changes and exits 10; `--yes` is required to write.
   - Reruns are idempotent; an unrelated existing entry is a conflict (exit 5) and is never overwritten.

   `.agents/install/hermes.sh` and `openclaw.sh` become one-release wrappers, then go.
10. **Maintainer actions stay out of the shipped tool.** `jobsearch` (bundled, end-user) covers use, hosts and data. `bun run plugin:build|plugin:check|plugin:sync-skills|plugin:release` (repo-only) covers building and releasing. The `manage` skill drives both and says which needs a checkout.
11. **Efficiency is a gate, not a goal.** `tests/context-budget.test.ts` puts ceilings on model-visible entries, description bytes, MCP schema bytes, triage output size and bundle size. Every number in the targets table below is enforced, so regressions fail `bun run gates` locally, where the checks actually run while Actions is billing-blocked.
12. **The tool measures itself.** Every `jobsearch` call appends `{ts, command, exit, ms, stdoutBytes}` to `$JOB_SEARCH_HOME/state/agent-calls.jsonl`. It never records arguments, and `JOB_SEARCH_TELEMETRY=0` turns it off. `manage` Audit reads this to find which commands agents actually use, which fail, and which outputs are large. This replaces the library's Claude-only `~/.claude/state/execution.jsonl` line.

## The `manage` skill

Built through the synced `create-skill` workflow, with this plugin's overrides recorded in `manage/PluginConventions.md`:

- kebab-case slug instead of TitleCase;
- scalar `allowed-tools`;
- `USE WHEN` and `NOT FOR` in the description, plus the agent-first sentence;
- telemetry through decision 12.

- **Type:** Operations runbook (8) plus deployment with safety gates and rollback (7). `category: workflow`, `effort: medium`, `domain: ops`.
- **BPE check:** passes. It carries repo-specific facts a stronger model cannot derive (gate composition, host contracts, version lockstep, data-home rules) and wraps tools rather than scaffolding reasoning.
- **Shape:** `SKILL.md` ≤ 50 lines (frontmatter, agent-first rule, routing table, gotchas, examples), plus `Workflows/` and `PluginConventions.md`.

| Workflow | Trigger | Does | Needs checkout |
|---|---|---|---|
| **Health** | "is it working", after install/upgrade | `jobsearch status` + `hosts-doctor`; in a checkout also `bun run gates` + `plugin:check`; reports a pass/fail table and changes nothing | no |
| **Extend** | "add a command/skill/portal/template/host" | Routes to `create-cli-agent` AddCommand (table entry → handler → contract tests → rebuild → MCP check → budget), `create-skill`, `/add-portal`, `/add-template`, or `create-plugin` | yes |
| **Hosts** | "install on Hermes/Pi/…", "uninstall", "roll back" | `hosts-install --dry-run` → show changes → human yes → `--yes` → `hosts-doctor` | no |
| **Release** | "ship it", "cut 1.2.0" | Clean tree → gates → `plugin:check` → `plugin:release --version` (all manifests in lockstep) → CHANGELOG → commit; tag and push only after approval | yes |
| **Audit** | "is it efficient", "why is it slow" | Budgets, `agent-calls.jsonl` summary, optional `claude plugin eval` (asks first, because it uses plan usage); proposes cuts as BACKLOG items | no |
| **Data** | "where is my data", "back up", "move my data" | `data-where`, `data-backup`, `data-migrate --dry-run/--yes` (copy and verify, never delete the source), `scan-personal-data` | no |

Gotchas it must carry:
- A stale `dist/` bundle.
- `${CLAUDE_PLUGIN_DATA}` deleted on uninstall.
- Version pins blocking updates.
- Namespaced command names.
- A gate reporting `unavailable` is not a pass.
- Never run a host install without `--dry-run` first and a human yes.

## Phases

Each phase lands as its own PR and ends with `bun run gates` green. Phases 4 and 5 can run in parallel after 3.

**Phase 0: Lock host contracts (S).** Read the current official docs and record links and dates in `docs/planning/host-contracts.md`:
- Hermes Agent Plugins v1: the `extensions` field, MCP declaration, unknown frontmatter keys (agent-plugins.org is not reachable from the build container, so check from a normal network).
- Pi packages and extensions.
- OpenCode skills and MCP.
- OpenClaw MCP.
- Whether Cowork's environment has Bun.
- Whether Codex or Gemini CLI justify a native adapter over MCP + `AGENTS.md`.

Resolve the open decisions below. *Done when:* every adapter decision cites a doc, not memory.

**Phase 1: Self-contained `jobsearch` (L).**
- `src/paths.ts` plus migration of all 43 call sites, with a lint test.
- `scripts/agent.ts` → `scripts/jobsearch.ts` (`bun run agent` kept as an alias for one release).
- New commands:
  - `status`: profile validity, tracker counts, follow-ups due, unranked postings, last gate results, and next steps.
  - `prepare`: evidence bundle, naming paths, market and template in one call.
  - `review`.
  - `render` (mutation).
  - `gate`: compact, failing gates and fix hints only.
  - `scrape`: NDJSON per portal plus a summary.
  - `tracker-add` and `outcome` (mutations).
  - `data-where` and `data-migrate` (mutation).
  - `mcp`.
- Loud asset failures (decision 3).
- Triage cache keyed by posting hash + profile hash + contract version, so `rank` becomes incremental.
- `--fields` projection and the call log.
- `plugin:build`: `dist/`, `assets/templates/`, the launcher, a freshness test and a size budget.

*Done when:* from a temp dir outside the checkout, with `JOB_SEARCH_HOME` set to a fixture home, `job-search/scripts/jobsearch triage` returns a real template, and `scrape --portals remoteok` runs with no repo `node_modules` (or against a fixture where there is no network).

**Phase 2: MCP from the table (M).**
- Generated tools per decision 6, sharing the CLI's envelope.
- Confirm gates preserved.
- The 15 legacy tool names kept behind `JOB_SEARCH_MCP_LEGACY=1` for one release.

*Done when:* ≤ 7 tools and ≤ 4 KB of schema, and the MCP contract tests pass.

**Phase 3: The plugin (L).**
- Consolidate the skill trees (decision 7).
- Plugin-local `.mcp.json` with `env.JOB_SEARCH_HOME: ${user_config.data_dir}`, plus `userConfig.data_dir` (type `directory`).
- `agents/reviewer.md` for `/apply`'s review stage.
- Delete root `.mcp.json`; point `opencode.json` at the launcher.
- Root `.claude-plugin/marketplace.json` → `./job-search`.
- Document the dev loop (`claude --plugin-dir ./job-search`).

*Done when:*
- `claude plugin validate ./job-search --strict` and `claude plugin validate .` pass.
- `claude plugin marketplace add ./` + `claude plugin install job-search@<marketplace>` in a clean `HOME` loads the skills and MCP.
- `hermes plugins doctor ./job-search` and `pi -e ./job-search` pass where those hosts are installed (otherwise reported as *not verified*, never assumed).
- The budget test passes.

**Phase 4: `manage` + synced skill-factory skills (M).**
- `plugin:sync-skills` + `.synced.json` + drift test.
- The `manage` skill per the section above.
- The plugin test updated for the new skill list.
- CreateSkill's TestSkill baseline-vs-skill comparison on three tasks ("add a command that lists follow-ups", "is my install healthy?", "release 1.2.0"); keep only what measurably helps.

*Done when:* the ValidateSkill checklist passes and the TestSkill comparison is recorded.

**Phase 5: Hosts (M).** `jobsearch hosts-*` per decision 9, including the `PATH` shim; the shell installers become wrappers. *Done when:* tests on a simulated clean `HOME` per host cover install, rerun idempotency, collision refusal (exit 5), dry-run (exit 10) and uninstall.

**Phase 6: Prove it (S, uses plan usage).**
- `tests/context-budget.test.ts`.
- `job-search/evals/` with ~6 cases: triage one posting, rank a folder, apply stops at the gate, an unrelated request must not fire a skill, manage health, manage add-command. Use `tool_used` graders with `input_match` on the `jobsearch` command.
- Run `claude plugin eval` with the no-plugin baseline.
- Before/after report in `docs/reports/`.

*Done when:* every target below is met or the miss is explained.

## Efficiency targets

| Measure | Today | Target |
|---|---|---|
| Skill/command entries visible in Claude Code | 19 (~4.7 KB) | ≤ 10 (≤ 4 KB, including the 3 synced skills) |
| `.agents/skills` entries (OpenCode and similar hosts) | 14 (~7.1 KB) | 1 router (≤ 0.3 KB) |
| MCP tools / schema | 15 / 12.1 KB | ≤ 7 / ≤ 4 KB |
| Calls to triage one posting | up to 5 + root resolution | 1 |
| Output read per triage | ~12–13 KB | ≤ 2 KB |
| Re-rank an unchanged folder | full recompute | cache hits only |
| Root-resolution calls per skill run | 1, plus a working directory on every call | 0 |
| Runs outside the checkout | no | yes (Bun; typst/poppler/canvas optional, reported when missing) |
| Shipped bundle | n/a | ≤ 1.5 MB, no native files |

## Risks and gotchas

- **Stale bundle:** the freshness test runs in `bun run gates` (pre-push hook).
- **Data loss on uninstall:** never write personal data to `${CLAUDE_PLUGIN_DATA}`.
- **Renamed commands:** namespacing turns `/apply` into `/job-search:apply`. Say so in the release notes.
- **Version pins:** every shipped change needs a version bump, so the Release workflow enforces it.
- **Private marketplace:** each machine needs git credentials for `RohiRIK/jobsearch-plugin`.
- **Personal data in the build:** the plugin build runs `scan-personal-data` over `job-search/` including `dist/`. Test fixtures must never be bundled. The root `CLAUDE.md` (which holds the candidate profile) is not part of the plugin.
- **Dev loop changes:** once `.claude/commands` move into the plugin, repo sessions need the plugin loaded (`--plugin-dir` or installed).
- **Hermes unknowns:** frontmatter keys such as `category`/`effort`/`domain` on synced skills are unverified on Hermes until Phase 0.

## Open decisions (defaults chosen; change before Phase 1)

1. **Host scope:** Claude Code (+ Cowork), Hermes, OpenCode, OpenClaw and Pi natively; Codex, Gemini and any other host through MCP + `AGENTS.md`.
2. **Skill-factory skills:** synced into this plugin (one install, every host). The alternative is a separate `skill-factory` plugin from `RohiRIK/skills` plus Claude's `dependencies` field, which only works on Claude Code.
3. **Data home:** the order in decision 2, moved with `jobsearch data-migrate`.
4. **Legacy MCP tool names:** kept for one release behind a flag.
5. **Launcher location:** `scripts/` (Cowork-installable) over `bin/` (bare command in Claude Code only).

## Out of scope

Anthropic's public plugin directory or any public marketplace; a compiled single binary; Windows launcher support; rewriting portal scrapers or changing scoring logic; any deploy, publish, tag or global install without explicit approval.
