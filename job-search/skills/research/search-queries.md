# Search Queries for Job Scraper

<!-- SETUP: Customize markets, sites, and queries for your skills, target roles, and locations. -->

## Prefer the portal CLIs

Before web search, run the installed portal CLIs — they return structured, dated JSON
that dedups reliably. Discover them with `ls .agents/skills | grep -- -search`. Use
`WebSearch` with the `site:` queries below only for boards without a CLI and for
company career pages.

## Markets & sites

Organize the hunt by market. Your **primary market** is where you can work on-site;
**secondary markets** are searched for remote or relocation-friendly roles only.

### Primary market — Israel
- **alljobs.co.il** — largest general Israeli board (CLI: `alljobs-search`, once added via `/add-portal`)
- **drushim.co.il** — strong in hi-tech / Tel Aviv (CLI: `drushim-search`)
- **jobmaster.co.il** — engineering & corporate roles (CLI: `jobmaster-search`)
- **linkedin.com/jobs** — filter by Israel / your city (web search only — LinkedIn forbids scraping)

### Secondary market — Denmark (remote / relocation)
- **jobindex.dk** (CLI: `jobindex-search`), **akademikernes jobbank** (`jobbank-search`),
  **jobdanmark** (`jobdanmark-search`), **jobnet** (`jobnet-search`)

### Secondary markets — US & Europe (remote)
- **linkedin.com/jobs** — country-agnostic; put location or "remote" in the query
- Company career pages via `site:` searches; regional boards where no CLI exists

## Query categories

Grouped by priority. Combine each with the relevant market's location terms where the
site supports it (Israel: "Tel Aviv", "Herzliya", "מרכז"; Denmark: "Copenhagen",
"Hovedstaden"; remote: "remote", "hybrid").

### Priority 1: [YOUR_PRIMARY_ROLE_TYPE]
Your strongest and most desired direction.
```
# Israel
site:alljobs.co.il "[YOUR_PRIMARY_JOB_TITLE]" [YOUR_CITY]
site:linkedin.com/jobs "[YOUR_PRIMARY_JOB_TITLE]" Israel
# Remote / US / EU
site:linkedin.com/jobs "[YOUR_PRIMARY_JOB_TITLE]" remote
```

### Priority 2: [YOUR_DOMAIN_EXPERTISE]
Your domain expertise.
```
site:drushim.co.il [YOUR_DOMAIN_KEYWORD_1] [YOUR_CITY]
site:linkedin.com/jobs [YOUR_DOMAIN_KEYWORD_1] Israel OR remote
site:jobindex.dk [YOUR_DOMAIN_KEYWORD_2] [remote friendly]
```

### Priority 3: [YOUR_ADJACENT_ROLE_TYPE]
Adjacent roles you could pivot into.
```
site:alljobs.co.il "[YOUR_ADJACENT_TITLE_1]" [YOUR_KEY_SKILL] [YOUR_CITY]
site:linkedin.com/jobs "[YOUR_ADJACENT_TITLE_2]" [YOUR_KEY_SKILL] remote
```

### Priority 4: Broader technical / consulting
Wider net for general technical roles.
```
site:jobmaster.co.il [YOUR_KEY_SKILL] developer [YOUR_CITY]
site:linkedin.com/jobs "[YOUR_KEY_SKILL] developer" remote
```

## Location filter

Verify each result's location fits its market:
- **Primary (on-site OK):** [YOUR_CITY] and commutable areas — [ACCEPTABLE_AREA_1], [ACCEPTABLE_AREA_2]; [BORDERLINE_AREA] (borderline); [TOO_FAR_AREA] (too far).
- **Secondary (remote/relocation only):** accept only if the posting is explicitly remote,
  hybrid-with-remote-option, or offers relocation. An on-site secondary-market role is a reject.

## Date filter

Only jobs posted within the last 14 days, or with a future application deadline. If the
date is unknown, include it but flag "date unknown".

## Adapting queries

If the user names a focus area or market (`/scrape data science`, `/scrape remote`),
select the matching category/market and generate 2-3 custom queries for it.
