# Drushim Search CLI

A Bun CLI for scraping job listings from Drushim.co.il (דרושים), one of Israel's leading job boards.

## Setup
```bash
cd .agents/skills/drushim-search/cli
bun install
```

## Commands

### search
Search for jobs by keyword, category, and location.

```bash
bun run src/cli.ts search --category software --area "tel aviv" --limit 10 --format table
bun run src/cli.ts search --category qa --format json
```

### detail
Get full details for a specific job posting.

```bash
bun run src/cli.ts detail --id 37370210
```

## Options

### search
- `--category`, `-c` — Job category filter
- `--area`, `-a` — Location/area filter
- `--limit`, `-l` — Maximum number of results (default: 15)
- `--format`, `-f` — Output format: `json`, `table`, `ids` (default: json)

### detail
- `--id`, `-i` — Job ID (required)

## Categories
software, qa, hardware, hitech, internet, security, engineering, design, finance, hr, sales, marketing, legal, medical, education, management, logistics, retail, media, transport, tourism, industry, admin, customerservice

## Areas
tel aviv, holon, rishon lezion, petah tikva, raanana, herzliya, netanya, haifa, beer sheva, jerusalem, ashdod, rehovot, kfar saba, ramat gan, givatayim, modiin

## Output Formats
- `json` — Full job objects with all fields
- `table` — Formatted table with ID, Title, Company, Location, Date
- `ids` — Just job IDs, one per line (useful for piping to detail)
