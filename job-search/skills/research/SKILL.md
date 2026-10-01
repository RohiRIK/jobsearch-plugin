---
name: research
description: Find, score and rank job openings across portals, and look up what a CV should look like in a given country. USE WHEN searching for roles, triaging scraped postings, scoring fit for a posting, comparing markets, or asked "what should my CV look like in <country>". NOT FOR drafting documents (load the cv skill) or recording results (load the outcome skill).
allowed-tools: Read, Glob, Grep, Bash(jobsearch:*), Bash(bun run:*), WebFetch, WebSearch
---

# Research roles and markets

## Agent-first rule

You are the operator. Never ask the user to run a command from this skill. Run
the searches, parsers, and scoring yourself. Ask the user only to choose between
genuine shortlisted roles or to approve an external application action. Report
the results, including empty and errored portals.

## Running the tools

Run every command as `jobsearch <command>`; `jobsearch --help-json` lists them all.
If `jobsearch` is not on PATH, use `${CLAUDE_PLUGIN_ROOT}/scripts/jobsearch`
(Claude Code fills in that path) or `../../scripts/jobsearch` relative to this
skill's directory. Every command prints one JSON envelope: branch on `ok` and the
exit code (0 ok, 1 negative verdict, 2 usage or confirmation needed, 3 not found,
5 conflict, 10 dry-run, 20 unavailable). Writes need `--yes`, and only after the
user says yes; `--dry-run` previews. `jobsearch run <tool> …` reaches every
single-purpose tool (older notes say `bun run <tool> …`); a `bun run` line that
remains needs a source checkout.

`<workspace>` is `data.workspace.path` from `jobsearch status` — where personal
data lives, never inside the plugin. `<assistant>` is `<workspace>/data/assistant/`
when it exists, otherwise this plugin's `skills/cv/` defaults: copy a default there
before personalising it, and never edit files inside the plugin.

## Find openings

```bash
jobsearch scrape --query "cloud security engineer"
```

Runs the portal CLIs concurrently, normalizes canonical URLs and content hashes,
deduplicates against `<workspace>/data/seen-jobs.json` and the application tracker, and
reports per-portal counts plus any portal that errored. Search results are
leads, not complete postings. Fetch and save the full posting for shortlisted
roles before scoring or drafting; record its source URL and observed date.

Portals by market — IL: alljobs, drushim, jobmaster · DK: jobindex, jobbank ·
EU: arbeitnow · remote: remoteok, remotive, wwr. Scope a run with
`--portals jobindex,arbeitnow`. jobindex and jobbank run only from a source
checkout; an installed plugin reports them as errored with that reason — say so.
The output lists `newJobs` (count) and up to `--limit` of them.

Web search supplements the portals; it does not replace them. The portals are
deterministic and structured, so prefer them and use search for coverage they
lack.

## Triage

```bash
jobsearch run alerts list                                  # unreviewed scraped jobs
jobsearch triage --job <workspace>/data/jd/<company>.txt     # one posting: fit + market + template + projects + next steps
jobsearch rank --dir <workspace>/data/jd --limit 10          # every saved posting, NDJSON, best fit first
```

Prefer `triage`/`rank` over calling `score`, `select-template`, `markets` and
`projects match` one by one: it is one process, one compact JSON envelope
(`{"ok":…}`), and a semantic exit code (2 usage, 3 not found). Add `--verbose`
only when you need per-factor template rationale or skill evidence.
`jobsearch --help-json` lists every command and flag. Score complete saved
postings, not search-card text.

The fit score is 0-100 with a breakdown: skills 40, experience 25, sector 15,
location 10, language 10. Read the `neutral` array before trusting a number —
missing inputs score a documented neutral value rather than being penalised or
inflated, so a score built mostly from neutrals is an absence of evidence, not
a good fit.

Gaps in the output are real gaps. Report them to the user rather than
discounting them; they decide whether to apply.

## Market conventions

```bash
jobsearch run markets table          # all 15 markets at a glance
jobsearch run markets show de        # full conventions plus sources
```

Answer country questions from this command, never from memory. Each profile
carries its sources, and conventions shift — the cross-country reference behind
several of them dates from 2022. Two findings that contradict common
assumptions: Denmark commonly *does* include a photo, and official Danish
guidance invites a short personal section that GDPR-minded guides advise
against. The profile records both; say so rather than picking one silently.

## Market intelligence

```bash
jobsearch run market --format text   # demand snapshot from scraped jobs (--save for history)
jobsearch run trajectory             # skill-demand trend across saved snapshots
```

`trajectory` needs at least two saved snapshots and says so honestly otherwise.

## Rules

- **Never inflate a fit score** to make a role look viable, and never soften a
  gap into a strength.
- **Do not scrape portals that forbid it.** The built-in CLIs use public APIs
  and RSS by design; Indeed and LinkedIn HTML scraping violate their terms.
- **Report what the tools returned**, including portals that errored and
  markets with zero results. An empty result set is information.
- Hand a chosen posting to the cv skill; do not start drafting here.

## More in this skill (read when the step needs it)

| File | Read when |
|---|---|
| `Scraping.md`, `search-queries.md` | Planning a multi-market search, web-search supplements |
| `MarketConventions.md` | Explaining a country's CV conventions |
| `Upskill.md` | Asked what to learn, skill gaps across tracked postings |
| `../cv/04-job-evaluation.md` (or `<assistant>/`) | Scoring dimensions beyond the machine score |
