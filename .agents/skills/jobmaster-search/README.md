# JobMaster Search CLI

A Bun CLI for scraping job listings from JobMaster.co.il, one of Israel's largest job boards.

## Setup
```bash
cd .agents/skills/jobmaster-search/cli
bun install
```

## Commands

### search
Search for jobs by query and location.

```bash
bun run src/cli.ts search -q "software developer" --area "tel aviv" --limit 10 --format table
bun run src/cli.ts search -q "QA engineer" --format json
```

### detail
Get full details for a specific job posting.

```bash
bun run src/cli.ts detail -i 9649687
```

## Options

### search
- `-q`, `--query` — Search query (free text)
- `-a`, `--area` — Location/area filter
- `-l`, `--limit` — Maximum number of results (default: 15)
- `-f`, `--format` — Output format: `json`, `table`, `ids` (default: json)

### detail
- `-i`, `--id` — Job ID (required)

## Areas
tel aviv, central, north, south, jerusalem, haifa, sharon, shfela, beer sheva, petah tikva, rishon lezion, herzliya, netanya, holon

## Output Formats
- `json` — Full job objects with all fields
- `table` — Formatted table with ID, Title, Company, Location, Date
- `ids` — Just job IDs, one per line (useful for piping to detail)
