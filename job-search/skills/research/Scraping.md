> Context file of the `research` skill — `jobsearch`, `<workspace>` and `<assistant>` are defined in its SKILL.md.

# Job Scraper

You are a job-market researcher for the candidate profiled in CLAUDE.md. Search many
job boards for new positions that fit their profile, deduplicate against what they have
already seen and applied to, and present ranked matches with a quick fit signal. Results
feed the /rank and /apply workflows, so structured, deduplicated output matters more
than volume.

## Example invocations

- "/scrape" → full multi-market sweep with the portal CLIs, dedup, ranked summary
- "find me remote devops jobs in Denmark" → jobindex/jobbank/jobnet CLIs with remote filters
- "any new jobs since Tuesday?" → dedup against seen jobs, report only additions

## Two search surfaces — prefer the CLIs

**1. Portal CLIs (primary — deterministic and structured).** The repo ships
zero-config scraper CLIs under `.agents/skills/*/cli/`. Call them with `bun run`;
they return clean JSON (`{ meta, results[] }`) that dedups reliably. Discover what
is installed rather than hardcoding a list:

```bash
ls .agents/skills | grep -- -search   # e.g. jobindex-search, remoteok-search, alljobs-search
bun run .agents/skills/<portal>-search/cli/src/cli.ts search -q "<query>" --jobage 14 --limit 20 --format json
```

- For US/European/remote roles use the remote portals (RemoteOK, Remotive, WWR, Arbeitnow) via `jobsearch scrape`.
- The `job*` CLIs (jobindex, jobbank, jobdanmark, jobnet) cover the **Danish** market.
- Israeli portals (AllJobs, Drushim, JobMaster) are added via `/add-portal`; once
  present they appear in the `ls` above and follow the identical `search`/`detail` contract.

**2. Web search (supplement).** Use `WebSearch`/`WebFetch` for markets or boards
without a CLI, and for company career pages. See `search-queries.md` for the
site-scoped query catalog, grouped by market and role.

## Invocation

"Find new jobs" · "Scrape for jobs" · "Any new remote positions?" · `/scrape`

Optional args: a focus area (`/scrape data science`), a market (`/scrape israel`,
`/scrape remote`), or `broad` to run every category and every installed portal.

## Execution Steps

### Step 0: Load state
1. Read `job_scraper/seen_jobs.json` (create `{"seen": {}}` if missing).
2. Read `job_search_tracker.csv` for already-applied company+role pairs.
3. Read `search-queries.md` for the query strategy and target markets.
4. `ls .agents/skills | grep -- -search` to see which portal CLIs are installed.

### Step 1: Search
- Run the installed **portal CLIs** for the top query categories (all categories if
  `broad`). Cap each with `--jobage 14 --limit 20`. Run independent portals in
  parallel (background Bash or the Agent tool).
- For the primary market, run every relevant local portal. For remote/US/EU roles,
  run the remote portals with location/remote terms in the query.
- Supplement with `WebSearch` for company career pages and any market lacking a CLI.

### Step 2: Fetch & parse
- CLI results are already structured — take `id`, `title`, `company`, `location`,
  `date`, `url` directly. For a promising hit needing the full description, call the
  portal's `detail <id>`.
- For web-search hits, `WebFetch` the posting and extract the same fields.
- Skip anything whose URL or company+title key is already in `seen_jobs.json`, or
  whose company+role is already in `job_search_tracker.csv`.

### Step 3: Quick fit signal
A rapid check, **not** the full `04-job-evaluation.md` pass:
- **High** — directly involves your core skills.
- **Medium** — adjacent to your experience.
- **Low** — needs significant skills you lack.
Weigh remote-friendliness: a great secondary-market role that is on-site with no
relocation/remote option is a **Low**, however good the match.

### Step 4: Deduplicate & store
Add **all** fetched jobs (new and skipped) to `seen_jobs.json`:
```json
{ "seen": { "<url_or_company_title_key>": {
  "title": "...", "company": "...", "location": "...", "market": "il|dk|us|eu|remote",
  "url": "...", "first_seen": "YYYY-MM-DD", "fit": "high|medium|low",
  "status": "new|skipped|evaluated|ranked|expired" } } }
```
Only present jobs not already seen or tracked.

### Step 5: Present results
Sorted by fit (high first), grouped or tagged by market:

```
## New Job Matches — YYYY-MM-DD
Found X new positions (Y high, Z medium, W low) across <markets>.

| # | Fit | Market | Title | Company | Location | Deadline | URL |
|---|-----|--------|-------|---------|----------|----------|-----|
```
For each high-match job add 2-3 bullets: why it matches, key requirements to check,
red flags. Then ask: *"Want me to evaluate any of these in detail? Give me the number(s)."*
A chosen number hands off to the **job-application-assistant** workflow.

If the run found ~8+ new jobs, suggest `/rank` for a full-framework ranked shortlist
(`/rank` sets `ranked`/`expired` in `seen_jobs.json`; treat both as already-seen).

### Step 6: Update tracker (optional)
If the user applies to a job, add a row to `job_search_tracker.csv`.

## Gotchas

- **Prefer CLIs over WebSearch.** WebSearch results are noisy, undated, and hard to
  dedup; the portal CLIs return structured, dated JSON. Only fall back to search for
  boards without a CLI.
- **`bun run` needs the correct cwd.** Invoke CLIs from the repo root (the `.agents/...`
  path is repo-relative); a wrong cwd yields a module-not-found error, not job results.
- **Don't hardcode the portal list.** Discover it with `ls .agents/skills`. New portals
  (e.g. Israeli ones from `/add-portal`) must be picked up automatically.
- **Location handling differs per portal.** Some accept a location flag; others only
  match location inside `--query` (jobindex-search). Check the portal's
  SKILL.md/url-reference.md before assuming a `--location` flag exists.
- **Hebrew queries and RTL.** Israeli boards return Hebrew titles/companies; keep them
  as-is (don't transliterate) and pass Hebrew or English search terms as the portal supports.
- **Never fabricate postings.** Present only jobs returned by an actual CLI run or
  WebFetch. No invented titles, companies, or URLs.
- **Respect dedup every time.** Check both `seen_jobs.json` and `job_search_tracker.csv`
  before presenting — re-surfacing seen jobs erodes trust in the run.
- **Only open positions.** Skip expired deadlines and closed postings.
