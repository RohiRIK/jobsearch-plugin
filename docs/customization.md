# Customization

How to personalize the AI Job Search framework for your market, templates, and workflow preferences.

---

## Manual Profile Editing

If you prefer editing files directly instead of using `/setup`:

| File | What to Change |
|:-----|:---------------|
| `CLAUDE.md` | Full profile (name, education, experience, skills, goals) |
| `01-candidate-profile.md` | Structured CV data |
| `02-behavioral-profile.md` | Behavioral / personality assessment |
| `04-job-evaluation.md` | Skill match areas, career goals, motivation filters |
| `05-cv-templates.md` | Profile statement templates for different role types |
| `07-interview-prep.md` | STAR examples from actual experience |
| `search-queries.md` | Job search queries for your skills and location |

The defaults ship in the plugin under `job-search/skills/cv/` (and `job-search/skills/research/search-queries.md`). Personalised copies live in your workspace under `data/assistant/` — copy a default there before editing it; skills read the workspace copy when it exists. Never edit files inside an installed plugin: updates replace them.

---

## Search Configuration

As your priorities evolve, reconfigure just the job search without re-running the full profile setup:

```bash
/setup --section search
```

This re-runs the search configuration interview: which roles to target, which skills to search for, which locations, and which portals. It also suggests role types you may not have considered based on your profile.

---

## Document Templates

### Built-in Templates

**CV templates** (Typst, under `templates/cv/`):

| Template | Best For |
|:---------|:---------|
| Academic | Research, university, and institutional roles |
| Banking | Finance, consulting, and traditional corporate |
| Creative | Design, media, and startup environments |
| Modern | Technology, product, and general professional roles |

**Cover letter templates** (Typst, under `templates/cover/`):

| Template | Best For |
|:---------|:---------|
| Casual | Startups, creative agencies, flat organizations |
| Classic | Corporate, government, and traditional sectors |
| Modern | Technology companies and mid-size organizations |

Additionally, a **LaTeX CV template** using [moderncv](https://ctan.org/pkg/moderncv) (banking style) is available under `cv/`, and a **LaTeX cover letter class** (`cover.cls`) with Lato/Raleway fonts under `cover_letters/`.

### Template Intelligence Engine

The `pipeline:full` command automatically scores every template against each posting using the **template intelligence engine** (`tools/match/template-engine.ts`). Scoring factors:

- **Sector / Industry** — which template aesthetics suit the target sector
- **Formality level** — formal vs. casual employer culture
- **Market / RTL** — language direction and market conventions
- **Role fit** — template design alignment with role type
- **Seniority fit** — junior vs. senior presentation style
- **Profile fit** — how well the template showcases the candidate's strengths

Each template receives a weighted score with per-factor rationale, a confidence level, and stub-availability guards (templates with only stubs are flagged but never auto-selected).

### Registering Custom Templates

```bash
/add-template
```

Point it at your `.tex` or `.typ` file (plus any `.cls`/`.sty` files or bundled fonts). The command:
1. Interviews you for template instructions (compile engine, fonts, style rules, page limit)
2. Stores everything under `templates/`
3. Runs a mandatory test compile
4. Activates the template so `/apply` drafts from it

Templates are stored with `[PLACEHOLDER]` tokens instead of personal data, so they're safe to commit and share.

**Managing templates:**

```bash
/add-template --list          # Show registered templates
/add-template --use <name>    # Switch active template
/add-template --use default   # Revert to stock templates
```

Manual route: update the guidance in `05-cv-templates.md` and `06-cover-letter-templates.md` directly.

---

## Job Portal Skills

### Shipped Portals

The framework ships with 8 job portal integrations:

| Portal | Market | Skill Directory |
|:-------|:-------|:----------------|
| AllJobs | Israel | `.agents/skills/alljobs-search/` |
| Drushim | Israel | `.agents/skills/drushim-search/` |
| JobMaster | Israel | `.agents/skills/jobmaster-search/` |
| Jobbank | Denmark | `.agents/skills/jobbank-search/` |
| Jobdanmark | Denmark | `.agents/skills/jobdanmark-search/` |
| Jobindex | Denmark | `.agents/skills/jobindex-search/` |
| Jobnet | Denmark | `.agents/skills/jobnet-search/` |

Each skill follows a standardized contract: `search` and `detail` commands, JSON/table/plain output to stdout, structured errors to stderr.

### Adding Your Own Portal

```bash
/add-portal
```

Provide your local job board's URL. The command:
1. Investigates the portal (search-URL pattern, result-page structure, `robots.txt` / access rules)
2. Scaffolds a CLI skill with the same structure, commands, and output contract as the shipped ones
3. Test-runs a live query before registering

**Rules:**
- Auth-walled portals are declined
- Portals with restrictive terms get a personal-use-only warning
- Generated skills are market-specific and live in your fork

### LinkedIn

No LinkedIn scraper ships here: LinkedIn's terms forbid automated access. Search LinkedIn manually or with web search; the portal CLIs and `/add-portal` cover job boards that publish feeds or permit access.

<!-- removed: country-agnostic LinkedIn CLI --> — it works for any market by passing the location explicitly:

```bash
# Any location, any market
```

Zero runtime dependencies — runs with plain `bun`. **Personal use only** — automated access is against LinkedIn's Terms of Service.

---

## Salary Benchmarking

The salary tool works with **any salary data you provide** — union statistics, Glassdoor exports, personal research, etc. See `.agents/skills/salary-search/SKILL.md` for the expected data format.

Features:
- Fuzzy company name matching across multiple formats: Danish/Nordic (A/S, ApS), European (GmbH, AG, S.A., B.V.), American (Inc, LLC, Corp), Israeli/Hebrew (בע"מ)
- Commands: `lookup`, `list`, `convert`
- Match scoring 0-100, threshold ≥30

If you don't have salary data, the salary step is simply skipped during `/apply`.

---

## Tips for Better Results

### Profile Depth Matters

The single biggest factor in output quality is how much detail you put into your profile.

- **Role descriptions** — Don't just list titles. Describe specific projects, tools, responsibilities, and measurable achievements.
- **Skills in context** — "Built ML pipelines for customer churn prediction in Python using scikit-learn" gives the system far more to work with than "Python, machine learning."
- **All onboarding paths work** — Whether you use documents, paste a CV, or do the interview, richer input produces sharper output.

### Career Path Discovery

The framework supports two modes:

- **Explicit targeting** — You know which roles you want. The system helps refine and prioritize.
- **Latent opportunity discovery** — By analyzing your full history (not just titles, but actual work), the system surfaces career paths you haven't considered: transferable skills mapping to unexpected industries, patterns in what you enjoyed, emerging roles that combine your expertise with new technology.

To get the most from this, describe during `/setup` not just your experience, but what energized you, what drained you, and what you'd want more of. This context directly shapes fit evaluation and role surfacing.
