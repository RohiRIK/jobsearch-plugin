# Setup Guide

Get the AI Job Search framework running in under 10 minutes.

---

## Prerequisites

Install these before cloning. Each one is required for a specific part of the workflow:

| Tool | What it does | Install |
|------|-------------|---------|
| **Claude Code** | AI engine — evaluates fit, drafts CVs, runs the full workflow | `npm install -g @anthropic-ai/claude-code` |
| **Bun** | Runtime for all CLI tools (job search portals, salary lookup) | `curl -fsSL https://bun.sh/install \| bash` |
| **LaTeX** | Compiles `.tex` files to PDF (CV + cover letter) | See below |

### LaTeX

Two engines are used — both ship with these distributions:

- **macOS:** `brew install --cask mactex` ([MacTeX](https://tug.org/mactex/))
- **Windows:** [MiKTeX](https://miktex.org/download)
- **Linux:** `sudo apt install texlive-full`

| Document | Engine | Why |
|----------|--------|-----|
| CV | `lualatex` | Handles `fontawesome5` font expansion cleanly |
| Cover letter | `xelatex` | Required by `cover.cls` for custom Lato/Raleway fonts |

### ATS prerequisite: pdftotext

Used by `/apply` to verify the PDF text layer the way an ATS reads it. Without it, ATS remains unverified: visual review is not a substitute, and the output is a non-shipping local pilot until `pdftotext` is available and the full `reevaluate` gate passes.

```bash
brew install poppler          # macOS
sudo apt install poppler-utils  # Linux
```

---

## Step 1 — Clone

```bash
git clone https://github.com/RohiRIK/jobsearch-plugin.git
cd jobsearch-plugin
```

## Step 2 — Install CLI dependencies

Each portal tool has its own `cli/` directory with a `package.json`. Run this from the repo root to install all at once:

```bash
for tool in alljobs-search drushim-search jobmaster-search jobbank-search jobdanmark-search jobindex-search jobnet-search; do
  cd .agents/skills/$tool/cli && bun install && cd ../../../..
done
```

**Why this matters:** The `/scrape` command calls these CLIs to search job portals. Without `bun install`, the tools can't run — and `/scrape` will find nothing.

**Market coverage:**

| Market | Portals |
|--------|---------|
| Israel | AllJobs, Drushim, JobMaster |
| Denmark | Jobbank, Jobdanmark, Jobindex, Jobnet |
| Global | LinkedIn (public listings) |

Not in Israel or Denmark? Add your local job board after setup with `/add-portal` — it scaffolds the same CLI structure and test-runs a live query before registering.

## Step 3 — Onboard your profile

The checkout carries a schema-valid, placeholder-only template at
`data/profile.json.example`. Ask your agent to set up the profile; the agent
creates `data/profile.json` from that template, validates it, and only asks you
for facts it cannot read from your documents. You do not need to run any
command yourself.

Start your agent in the repo root:

```bash
claude
```

Then run:

```
/setup
```

Three paths, same result:

| Path | Choose this if | How it works |
|------|---------------|--------------|
| **A — Documents** | You have a CV, LinkedIn export, diplomas, or references | Drop files in `docs/personal/`, Claude reads and cross-references them |
| **B — Single CV** | You have one resume ready | Paste text or reference a file with `@filename` |
| **C — Interview** | Starting from zero | Answer structured questions, one section at a time |

### What you get

Each path populates these files:

| File | What it holds | Why it matters |
|------|--------------|----------------|
| `CLAUDE.md` | Full candidate profile | Claude reads this for every `/apply` and `/scrape` |
| `01-candidate-profile.md` | Structured education, experience, skills | Drives CV tailoring and fit scoring |
| `02-behavioral-profile.md` | Behavioral traits and preferences | Used in culture-fit evaluation |
| `04-job-evaluation.md` | Skill match areas, career goals, deal-breakers | Powers the fit scoring framework |
| `05-cv-templates.md` | Profile statement templates by role type | Template selection during CV drafting |
| `07-interview-prep.md` | STAR examples from your experience | Interview prep and talking points |
| `assets/cv/main_example.tex` | LaTeX CV with your actual details | Starting point for `/apply` |
| `search-queries.md` | Search terms for `/scrape` | What portals to query and with what keywords |

### Updating later

Re-run any section without redoing the whole thing:

```
/setup --section skills
/setup --section experience
/setup --section search
```

`--section search` re-runs the search configuration interview — useful when your priorities shift.

---

## Step 4 — Run your first application

Pick a job posting from any supported portal and run:

```
/apply https://alljobs.co.il/Apply/H12345
```

No URL? Paste the job description directly:

```
/apply
[then paste the full job posting text]
```

### What happens

1. **Fit evaluation** — Claude scores the posting against your profile across skills, experience, culture, location, and career alignment
2. **Your call** — shows the evaluation and asks if you want to proceed
3. **CV + cover letter** — drafts tailored LaTeX documents for this specific role
4. **Reviewer critiques** — a second agent researches the company and critiques the drafts
5. **Revision** — incorporates feedback
6. **PDF compilation** — lualatex for CV (2 pages, no orphaned entries), xelatex for cover letter (1 page, signature visible)
7. **ATS verification** — extracts text layer, checks parsing, scores keyword coverage
8. **Deliver** — final output with a verification checklist

### Example: what `/apply` output looks like

```
## Fit Evaluation: 82/100 — Strong Match

| Dimension | Score | Notes |
|-----------|-------|-------|
| Skills | 9/10 | Python, ML, data pipelines — direct match |
| Experience | 8/10 | 3+ years relevant, missing cloud cert |
| Culture | 8/10 | Agile, collaborative — aligns with your profile |
| Location | 10/10 | Tel Aviv, hybrid — matches preferences |
| Career | 7/10 | Senior IC path, your stated goal |

### Gaps
- Cloud certification (AWS/Azure) — mentioned as nice-to-have, not required

Proceed with application? [y/n]
```

---

## Optional — Salary benchmarking

If you have salary data, the `/apply` workflow includes a salary benchmark step:

```bash
# Convert from Excel:
bun run .agents/skills/salary-search/cli/src/cli.ts convert path/to/data.xlsx --source "My Data 2025"

# Or create salary_data.json manually (see .agents/skills/salary-search/README.md)
```

Without this file, salary lookup is simply skipped.

---

## Agent integration

Project-local activation for Hermes Agent, Claude Code, and OpenCode is described in [the integration guide](docs/AGENTS-INTEGRATION.md). Do not run the legacy umbrella installer for this path: it changes user-level Hermes and OpenClaw configuration. OpenClaw remains supported through the legacy installer only with explicit approval after inspecting existing registrations.

## Document quality gates

- `bun run naming show <company> <role>` — convention-correct filenames (`<Name>_<Company>_<Role>_<CV|CL>`); `bun run naming check` lints existing files.
- `bun run reevaluate --company X --role Y` — mandatory before any document ships: compile freshness, CV exactly 2 pages / cover letter exactly 1, ATS text layer, naming. Exit 1 with fix hints until green; verdicts recorded with document versions.

## The improvement loop

The repo carries its own work queue: `docs/planning/BACKLOG.md` (top-down, one item per pass, contract at the top). A scheduled agent session works through it and logs to `data/reports/improve-loop.log`. To resume in a fresh Claude Code session: "restart the improvement loop — every 3 hours, follow the BACKLOG.md contract."

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `salary_data.json not found` | Expected if you skipped salary setup — the workflow handles this gracefully |
| CLI tools not working | Run `bun install` in each tool's `cli/` directory, then verify with `bun run src/cli.ts --help` |
| CV compilation fails | Use `lualatex` (not `pdflatex`) — the moderncv template needs font expansion support |
| Cover letter compilation fails | Use `xelatex` — `cover.cls` requires fontspec for custom fonts |
| Fonts missing | Verify `assets/cover_letters/OpenFonts/fonts/` contains Lato and Raleway `.ttf` files |
| Settings conflicts | Delete stale overrides: `rm .claude/settings.local.json` |
