# Salary Benchmark Tool

Benchmark company salaries against a baseline from **your own** data. Used during
the `/apply` workflow to show how a company's compensation compares to the market.
This is the TypeScript/Bun successor to the old `salary_lookup.py` / `convert_salary_excel.py`
scripts — same data format, market-agnostic name matching.

**Optional.** With no `salary_data.json`, the salary step is skipped during `/apply`.

## How it works

The tool reads a `salary_data.json` file (repo root by default) of company salary
benchmarks and fuzzy-matches by name. It handles legal suffixes and market noise
across **Danish/Nordic** (A/S, ApS, AB, Oy), **continental European** (GmbH, AG,
S.A., S.L., B.V.), **American/English** (Inc, LLC, Corp, Ltd), and **Israeli/Hebrew**
(בע"מ) company names, plus anglicized spellings, Hebrew final-letter forms, and
partial matches.

The data format supports any index-based or absolute metric: index 100 = median,
absolute monthly salary in any currency, or any custom metric.

## Data format

`salary_data.json`:

```json
{
  "metadata": {
    "source": "My Salary Data 2025",
    "index_baseline": 100,
    "index_label": "Index",
    "baseline_description": "Index 100 = median salary for the sector"
  },
  "companies": [
    {
      "company": "Novo Nordisk A/S",
      "city": "Bagsværd",
      "categories": {
        "all_employees": { "count": 500, "index": 108.5 },
        "engineering": { "count": 120, "index": 112.3 }
      }
    },
    {
      "company": "Check Point Software Technologies Ltd",
      "city": "Tel Aviv",
      "categories": { "engineering": { "count": 300, "index": 115.0 } }
    }
  ]
}
```

### Fields

- **metadata.source / index_baseline / index_label / baseline_description** — dataset metadata shown in output.
- **companies[].company** — company name (required).
- **companies[].city** — city/location (optional, used for `--city` filtering).
- **companies[].categories** — named salary categories, each with `count` and/or `index`.

## Setup options

**A. By hand** — write `salary_data.json` directly from any source (union stats, Glassdoor, surveys, networking, research).

**B. From Excel** — auto-detects a `Company`/`Firma`/`חברה` column, an optional
`City`/`By`/`עיר` column, and pairs `count`/`index` columns per category:

```bash
bun run .agents/skills/salary-search/cli/src/cli.ts convert path/to/salary-data.xlsx \
  --source "My Salary Data 2025" --baseline 100 \
  --baseline-desc "Index 100 = median salary"
```

**C. From research** — start from a minimal template and add companies as you go
(set `index_baseline` to `0` and `index_label` to e.g. `"Monthly salary (ILS)"` for
absolute values).

## Usage

```bash
bun run .agents/skills/salary-search/cli/src/cli.ts lookup "Novo Nordisk"
bun run .agents/skills/salary-search/cli/src/cli.ts lookup "Check Point" --format json
bun run .agents/skills/salary-search/cli/src/cli.ts lookup "SAP" --city "Walldorf"
bun run .agents/skills/salary-search/cli/src/cli.ts list
```

## Notes

- `salary_data.json` is **git-ignored** (see `.gitignore`) — your salary data may be proprietary.
- If the file is missing, the tool prints guidance to stderr and exits 1; `/apply` skips the benchmark.
- Machine output (`--format json`) is on stdout; logs/errors on stderr — pipes cleanly to `jq`.
