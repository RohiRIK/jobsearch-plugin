---
name: salary-search
version: 1.0.0
description: >
  Benchmark a company's compensation against a user-provided salary dataset.
  Fuzzy-matches company names across markets — Danish/Nordic legal suffixes
  (A/S, ApS), continental European forms (GmbH, AG, S.A., B.V.), American forms
  (Inc, LLC, Corp), and Israeli/Hebrew names (בע"מ) — handling anglicized
  spellings, final-letter forms, and partial matches. Used during the /apply
  workflow to add a salary benchmark to the fit evaluation. Trigger phrases:
  salary lookup, salary benchmark, compensation benchmark, how much does company
  pay, salary index, pay data, salary data, benchmark salary, company salary,
  løn, lønindeks, שכר, benchmark compensation.
allowed-tools: Bash(bun run:*)
---

# Salary Benchmark Search

Look up how a company's pay compares to a baseline, using **your own** salary
dataset (`salary_data.json`). This tool ships no data — it is a matcher over a
file you build from union statistics, Glassdoor exports, surveys, or research.
See `README.md` in this folder for the data format and how to build it.

**Optional.** If `salary_data.json` is missing, the lookup exits with a helpful
error and the `/apply` workflow simply skips the salary step.

## Commands

Run from the repo root so `salary_data.json` resolves in the current directory.

```bash
# Look up a company (human table by default)
bun run .agents/skills/salary-search/cli/src/cli.ts lookup "Novo Nordisk"

# JSON for programmatic use (this is what /apply parses)
bun run .agents/skills/salary-search/cli/src/cli.ts lookup "Check Point" --format json

# Narrow by city
bun run .agents/skills/salary-search/cli/src/cli.ts lookup "SAP" --city "Walldorf"

# List every company in the dataset
bun run .agents/skills/salary-search/cli/src/cli.ts list

# Build salary_data.json from an Excel workbook
bun run .agents/skills/salary-search/cli/src/cli.ts convert salary-2025.xlsx \
  --source "My Salary Data 2025" --baseline 100 \
  --baseline-desc "Index 100 = median monthly salary"
```

### Flags

| Command | Flag | Meaning |
|---------|------|---------|
| `lookup` | `<company>` (positional) | Company name to search for |
| `lookup` | `--city`, `-c` | Filter matches by city |
| `lookup` | `--data`, `-d` | Path to the dataset (default `./salary_data.json` or `$SALARY_DATA`) |
| `lookup` | `--format` | `json`, `table` (default), `plain` |
| `list` | `--data`, `-d` / `--format` | Same data source; `plain` (default) or `json` |
| `convert` | `<file>` (positional) | Excel workbook to convert |
| `convert` | `--output`, `-o` | Output JSON path (default `./salary_data.json`) |
| `convert` | `--source`, `-s` / `--baseline` / `--baseline-desc` | Dataset metadata |

## Output contract

- Machine output (`--format json`) goes to **stdout**; progress logs and errors
  go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.
- A missing dataset prints a guidance block to stderr and exits `1` — callers
  treat this as "salary data not configured, skip the step".

## Matching notes

- Legal suffixes and geographic noise (`A/S`, `GmbH`, `Ltd`, `Inc`, `Group`,
  `Israel`, `Denmark`, `Technologies`, …) are stripped before comparison.
- Danish/Nordic characters (ø, æ, å) match their anglicized spellings (o, ae, aa).
- Hebrew names fold niqqud, geresh/gershayim, and final letter forms, and drop
  the בע"מ (Ltd) suffix, so Hebrew and transliterated variants collapse together.
- Scores range 0–100; results scoring ≥30 are returned, best first.
