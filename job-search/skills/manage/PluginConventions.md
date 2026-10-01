# Plugin conventions (where this plugin overrides the skill library)

The synced `create-skill`, `create-cli-agent` and `create-plugin` skills come from RohiRIK/skills and follow that library's canon. Inside this plugin, the host contracts in `docs/planning/host-contracts.md` (checkout) win wherever they disagree. This table is the whole list.

| Library rule | In this plugin | Why |
|---|---|---|
| Skill names are TitleCase | **kebab-case**, equal to the directory (`manage`, `create-skill`) | Hermes, OpenCode and the Agent Skills spec reject anything else |
| Context files are TitleCase `.md` in the skill root | Same; the numbered `cv/0X-*.md` references keep their names | Unchanged |
| Description ≤ 30 words | Host limit 1024 characters; must contain `USE WHEN` and `NOT FOR` and be > 80 characters (`tests/job-search-plugin.test.ts`) | Routing signal matches the other plugin skills |
| `allowed-tools` any form | **A single string**, never a YAML list | Hermes skips a skill whose value is a list |
| Telemetry line to `~/.claude/state/execution.jsonl` | **None.** `jobsearch` logs every call to `<workspace>/data/state/agent-calls.jsonl` | Host-neutral; no Claude-only paths in shipped skills |
| README row per skill | Row in the skill table of `job-search/README.md` | The plugin's own index |
| Workflow skills may assume the user's tools | Every workflow skill body contains "Never ask the user to run a command" and runs `jobsearch` itself | Tested |
| Commands are `bun run <script>` | `jobsearch <command>`; `jobsearch run <tool>` for single-purpose tools; `bun run` only for checkout-only maintainer steps | Installs have no repo checkout |

## Adding a `jobsearch` command (the create-cli-agent AddCommand contract, here)

1. One entry in `src/jobsearch/commands.ts` (`CORE_COMMANDS`): `summary`, `mutation`, `output`, `flags`, `run`. Set `mcpTool` only for a command agents will call constantly — every named tool costs context on every turn.
2. Mutations call `confirmWrite(values, …)` before writing; reads never write.
3. Throw `AgentError(type, message, suggestions)` — never `process.exit`, never print. Unknown failures stay `internal`.
4. Contract tests in `tests/jobsearch-cli.test.ts`: success shape, usage error (2), not found (3), and for writes: refusal without `--yes`, `--dry-run` exit 10, conflict 5.
5. `bun run plugin:build`, then `bun run gates`. The MCP tools and `--help-json` pick the command up from the table.

## Adding a skill

Use `../create-skill` with the overrides above, then add the directory name to the skill list in `tests/job-search-plugin.test.ts` and a row in `job-search/README.md`. Keep `SKILL.md` ≤ 50 lines; move detail into context files listed in a "More in this skill" table.
