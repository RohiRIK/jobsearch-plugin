# Drushim Job Search Skill

Triggers: drushim, drushim.co.il, דרושים, find job Israel, Israeli jobs, software jobs Israel

## What it does
Scrapes Drushim.co.il (דרושים) — one of Israel's leading job boards — for job listings.

## Usage
```bash
cd .agents/skills/drushim-search/cli
bun run src/cli.ts search --category software --area "tel aviv" --limit 10 --format table
bun run src/cli.ts detail --id 37370210
```

## Options
- `search` — search for jobs
  - `--category` / `-c` — job category (software, qa, hardware, engineering, finance, hr, sales, etc.)
  - `--area` / `-a` — location filter (tel aviv, haifa, jerusalem, beer sheva, central, etc.)
  - `--limit` / `-l` — max results (default: 15)
  - `--format` / `-f` — output format: `json`, `table`, `ids` (default: json)
- `detail` — get full job details
  - `--id` / `-i` — job ID (required)

## Categories
`software`, `qa`, `hardware`, `hitech`, `internet`, `security`, `engineering`, `design`, `finance`, `hr`, `sales`, `marketing`, `legal`, `medical`, `education`, `management`, `logistics`, `retail`, `media`, `transport`, `tourism`, `industry`, `admin`, `customerservice`

## Areas
`tel aviv`, `holon`, `rishon lezion`, `petah tikva`, `raanana`, `herzliya`, `netanya`, `haifa`, `beer sheva`, `jerusalem`, `ashdod`, `rehovot`, `kfar saba`, `ramat gan`, `givatayim`, `modiin`

## Integration with job-scraper
