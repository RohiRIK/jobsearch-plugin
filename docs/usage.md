# Usage Guide

A complete reference for all workflows and commands in the AI Job Search framework.

---

## Core Workflow

The framework operates through three primary commands that form a pipeline:

### `/setup` — Build Your Profile

`/setup` is the onboarding command. It populates your career profile files that all other commands depend on. Three paths are available:

| Path | When to Use |
|:-----|:------------|
| **A — Documents folder** | You have career materials in `documents/` (CV PDF, LinkedIn export, diplomas, references, past applications). Idempotent and safe to re-run as you add more material. |
| **B — Single CV** | Paste a CV directly in chat for quick import. |
| **C — Interview** | Walk through a guided questionnaire to build your profile from scratch. |

Documents-folder mode (Path A) is the richest — see `documents/README.md` for the expected layout:

```
documents/
├── cv/              # Master CV (PDF or .tex)
├── linkedin/        # LinkedIn profile export (PDF)
├── diplomas/        # Degree certificates and transcripts
├── references/      # Reference letters
└── applications/    # Past application records (<company>_<role>/)
```

To reconfigure just the job search queries without re-running the full profile setup:

```bash
/setup --section search
```

### `/scrape` — Search for Jobs

`/scrape` searches multiple job portals simultaneously for positions matching your profile. Results are deduplicated and presented sorted by fit score.

Supported portals:

| Portal | Market | Notes |
|:-------|:-------|:------|
| AllJobs | 🇮🇱 Israel | AllJobs.co.il |
| Drushim | 🇮🇱 Israel | Drushim.co.il |
| JobMaster | 🇮🇱 Israel | JobMaster.co.il |
| Akademikernes Jobbank | 🇩🇰 Denmark | jobbank.dk |
| Jobdanmark | 🇩🇰 Denmark | jobdanmark.dk |
| Jobindex | 🇩🇰 Denmark | jobindex.dk |
| Jobnet | 🇩🇰 Denmark | jobnet.dk (government portal) |
| LinkedIn | 🌐 Global | Country-agnostic, zero runtime dependencies |

After a scrape, pick a match to apply directly, or run `/rank` first to batch-score them.

### `/apply <url>` — Apply to a Job

The full drafter-reviewer application pipeline:

```bash
# Apply via URL
/apply https://jobindex.dk/job/1234567

# If the URL can't be fetched, paste the full job description:
/apply <paste the full job description here>
```

See [How /apply Works](./apply-workflow.md) for the detailed 8-step pipeline.

---

## Extended Commands

Six additional commands extend the core workflow once your profile is in place:

### `/rank` — Batch-Score Scraped Jobs

Bridges `/scrape` and `/apply`: batch-scores all newly scraped postings against the fit framework using parallel agents. Returns a ranked shortlist with honest per-job strengths and gaps. Deal-breakers veto, deadlines get urgency flags, dead postings get marked expired. Pick a number and it hands off to `/apply`.

### `/outcome` — Record Application Results

Records what happened to an application — interview stages, offers, rejections, silence. Archives the submitted CV, cover letter, and posting text into `documents/applications/<company>_<role>/`. Updates the tracker. Once a few applications resolve, it points you back to `/setup` to calibrate the fit framework from what actually got interviews.

### `/expand` — Enrich Your Profile

Scans public sources linked in your profile (GitHub repos, portfolio site, Kaggle, Google Scholar) and looks up syllabi for named courses and certifications. Discovered competencies are added with a source tag. Useful right after `/setup` to surface skills that documents alone don't make explicit.

### `/upskill` — Skill Gap Analysis

Analyzes the gap between your profile and tracked job postings. Produces a prioritized heatmap of skill gaps and a learning plan with web-searched study resources and time estimates.

```bash
/upskill              # Analyze against all tracked postings
/upskill <url>        # Analyze against a specific posting
```

### `/add-template` — Register Custom Templates

Registers your own LaTeX or Typst CV or cover letter template. The command interviews you for the template's instructions (compile engine, fonts, style rules, page limit), stores everything under `templates/`, runs a mandatory test compile, and activates the template.

```bash
/add-template             # Interactive registration
/add-template --list      # Show registered templates
/add-template --use <name>  # Switch active template
/add-template --use default # Revert to stock templates
```

Templates are stored with `[PLACEHOLDER]` tokens instead of personal data, so they're safe to commit and share.

### `/add-portal` — Generate Portal Search Skills

Generates a job-portal search skill for any job board in your market. Give it your local job board's URL. The command:
1. Investigates the portal (search-URL pattern, result structure, `robots.txt`)
2. Scaffolds a CLI skill matching the shipped pattern
3. Test-runs a live query before registering

Auth-walled portals are declined. Portals with restrictive terms get a personal-use-only warning.

### `/reset` — Start Over

```bash
/reset profile    # Clear skill files, preserve framework rules
/reset documents  # Delete files from documents/ folder
/reset all        # Both
```

`/reset` shows exactly what will be deleted and requires you to type `RESET` to confirm.

---

## CLI Pipeline (No AI Required)

The TypeScript/Bun toolchain runs the mechanical parts without any agent. All pipeline commands support `--resume` for interrupted runs (state persisted in `data/pipeline-state.json`).

### Pipeline Commands

```bash
bun run pipeline:scrape --query "devops"       # Run portal scrapers, dedup into data/seen-jobs.json
bun run pipeline:full --job job.txt            # Parse + score a posting, track it
bun run pipeline:reason                        # Analyze outcomes → suggestions → profile merge → CLAUDE.md sync
bun run pipeline:docs                          # Recompile all Typst documents, record versions
bun run pipeline:weekly                        # Weekly review report to data/reports/
```

### Standalone Tools

```bash
bun run dashboard                              # Unified pipeline analytics
bun run followup pending                       # Applications due for follow-up
bun run summarize --input job.txt              # Job description → structured JSON
bun run score --input job.txt                  # 0-100 fit score with gap analysis
bun run select-template --job job.txt          # Rank CV/cover templates (scored, with rationale)
bun run cover-letter --company X --role Y      # Heuristic cover letter draft (.typ → PDF)
bun run email --type followup --id <app-id>    # Follow-up / thank-you / withdraw / referral email
bun run interview-prep --job job.txt           # Prep sheet: questions, talking points, gap strategy
bun run alerts list                            # Unreviewed scraped jobs; mark / mark-all to triage
bun run market --format text                   # Demand snapshot from scraped jobs (--save for history)
```

### Server & Integration

```bash
bun run api                                    # REST API + web dashboard at 127.0.0.1:8317
bun run mcp                                    # MCP server (stdio) for external agents
bun run test                                   # Run the full test suite (93 tests)
```

### Docker

```bash
# Run the API server
docker compose up app

# Run a one-off scrape
SCRAPE_QUERY="devops" docker compose run --rm scraper
```

Set `API_KEY` in `.env` to require an `x-api-key` header on all `/api/*` endpoints.
