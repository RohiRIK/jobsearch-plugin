# Agent plugin — before/after (2026-10-01)

Spec: `specs/agent-plugin.md` · Backlog: M16 (AP0–AP6). "Before" is commit `905646c` (the first `agent` CLI); "after" is this branch. Context costs are Claude Code's own estimate (`claude plugin details`, "Always-on" tokens), measured for both states with the same tool.

## Results

| Measure | Before | After | Target | Met |
|---|---|---|---|---|
| Always-on context, Claude Code in this repo | 19 skills/commands, ~1,791 tok | 16 skills/commands/agents, ~1,220 tok (−32%) — *including* the new `manage`, three skill-factory skills and `reviewer` | ≤ 10 entries, ≤ 4 KB descriptions | Bytes yes (3.2 KB); entry count **no** (16 — see note 1) |
| Always-on context, hosts reading `.agents/skills` (OpenCode, Pi; OpenCode also loaded `.claude/skills`) | 14 entries, ~2,789 tok (+ 7 `.claude/skills`) | 1 router, ~106 tok (−96%) | 1 router | yes |
| MCP tools / schema | 15 / 12,078 B | 7 / 4,713 B (−61%) | ≤ 7 / ≤ 4 KB | Tools yes; bytes **no** — ~0.8 KB is SDK boilerplate per tool (note 2); gated at 5 KB |
| Calls to triage one posting | up to 5 CLIs + 1 root-resolution call | 1 (`jobsearch triage`) | 1 | yes |
| Output read per triage | ~12–13 KB | ~1.3 KB | ≤ 2 KB | yes |
| Root-resolution calls per skill run | 1, plus a working directory on every call | 0 | 0 | yes |
| Runs outside the checkout | no | yes — verified from Claude Code's plugin cache after a clean-HOME marketplace install | yes | yes |
| Shipped bundle | n/a | 1.05 MB, no native files | ≤ 1.5 MB | yes |
| Re-rank an unchanged folder | full recompute | full recompute — **cache dropped** (note 3) | cache hits | changed |
| Tests | 360 | 468 | — | — |

## Notes

1. **Entry count.** The 10-entry target predates the decision to ship the skill factory (`create-skill`, `create-cli-agent`, `create-plugin`) and `manage` inside the plugin. Without those four, the plugin lists 12 entries at ~830 tok. Commands kept for muscle memory (`apply`, `rank`, `setup`, `expand`, `reset`, `add-portal`, `add-template`) cost 20–40 tok each. `tests/context-budget.test.ts` now gates at 16 entries and 3,500 description bytes, so growth fails the build.
2. **MCP bytes.** Each tool carries the SDK's `$schema`, `additionalProperties` and `execution` fields (~120 B × 7). Descriptions and flags were already trimmed; `--profile` is not offered over MCP. The ceiling in `tests/jobsearch-mcp.test.ts` is 5 KB.
3. **Triage cache.** Measured: triage compute is 1.5 ms warm, inside a ~105 ms Bun process start. A cache would add invalidation rules (posting, profile, templates, contract version) to save about 1% of the call. Not built.
4. **Behaviour evals** (`job-search/evals/`, six cases) are written and their structure is tested. They were **not run**: each run is a real model call on the account's plan. Run `claude plugin eval job-search@rohirik --scaffold --trust-plugin --allow-tools "Bash(*jobsearch*)"` to get the with/without-plugin score difference and cost.

## Host verification

| Host | State |
|---|---|
| Claude Code | **Loaded and run.** `claude plugin validate --strict` passes for the plugin and the marketplace. A clean-HOME `marketplace add` + `install` copied the plugin into the cache, and `jobsearch status` ran from there with the workspace on XDG. |
| Hermes Agent | **Statically validated** against `hermes_cli/agent_plugins.py` (field set, name patterns, `mcp.json` shape, stdio fields), and the installer was tested on a simulated HOME. No Hermes binary in the build container. |
| OpenCode, OpenClaw, Pi | **Installer tested** on a simulated HOME (links, config merges, conflicts, uninstall). No host binaries available; not loaded. |
| claude.ai / Cowork | **Format-compatible** (no top-level `bin/`). Bun availability inside Cowork is unverified. |
