# salary-search-cli

TypeScript/Bun CLI for benchmarking company salaries against a user-provided
`salary_data.json`. Successor to the `salary_lookup.py` / `convert_salary_excel.py`
scripts. See `../README.md` for the data format and setup; `../SKILL.md` for the
agent-facing skill definition.

## Install & verify

```bash
cd .agents/skills/salary-search/cli
bun install
bun run typecheck
bun test
```

## Commands

```bash
bun run src/cli.ts lookup "<company>" [--city <city>] [--data <path>] [--format json|table|plain]
bun run src/cli.ts list [--data <path>] [--format json|plain]
bun run src/cli.ts convert <file.xlsx> [--output <path>] [--source <name>] [--baseline <n>] [--baseline-desc <text>]
```

- **stdout**: machine output (`--format json`). **stderr**: logs + `{ "error", "code" }`, exit 1.
- Data file resolution: `--data` flag → `$SALARY_DATA` → `./salary_data.json`.

Runtime deps: `@bunli/core` (CLI framework), `zod` (validation), `xlsx` (Excel conversion).
