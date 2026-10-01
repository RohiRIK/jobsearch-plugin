# JobMaster Job Search Skill

Triggers: jobmaster, jobmaster.co.il, ג'וב מאסטר, find job Israel, Israeli jobs, software jobs Israel

## What it does
Scrapes JobMaster.co.il — one of Israel's largest job boards — for job listings.

## Usage
```bash
cd .agents/skills/jobmaster-search/cli
bun run src/cli.ts search -q "software developer" --area "tel aviv" --limit 10 --format table
bun run src/cli.ts detail -i 9649687
```

## Options
- `search` — search for jobs
  - `-q` / `--query` — search query (free text)
  - `--area` / `-a` — location filter (tel aviv, central, north, south, jerusalem, haifa, sharon, shfela)
  - `--limit` / `-l` — max results (default: 15)
  - `--format` / `-f` — output format: `json`, `table`, `ids` (default: json)
- `detail` — get full job details
  - `-i` / `--id` — job ID (required)

## Areas
`tel aviv`, `central`, `north`, `south`, `jerusalem`, `haifa`, `sharon`, `shfela`, `beer sheva`, `petah tikva`, `rishon lezion`, `herzliya`, `netanya`, `holon`

## Integration with job-scraper
When the job-scraper SKILL.md calls for Israeli portal scraping, use this CLI. Combine with alljobs-search and drushim-search for full Israeli market coverage.
