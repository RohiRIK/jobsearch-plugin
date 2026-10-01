# Architecture

Overview of the AI Job Search project structure, data flow, and integration surfaces.

---

## Project Structure

```
ai-job-search/
├── CLAUDE.md                              # Candidate profile + workflow rules
├── .claude/
│   ├── commands/                          # 8 slash commands
│   │   ├── apply.md                       # /apply — drafter-reviewer pipeline
│   │   ├── setup.md                       # /setup — onboarding (3 paths)
│   │   ├── rank.md                        # /rank — batch-score scraped postings
│   │   ├── outcome.md                     # /outcome — record application results
│   │   ├── expand.md                      # /expand — competency enrichment
│   │   ├── add-template.md                # /add-template — custom templates
│   │   ├── add-portal.md                  # /add-portal — generate portal skills
│   │   └── reset.md                       # /reset — wipe profile data
│   └── skills/                            # 6 Claude Code skills
│       ├── job-application-assistant/     # Core: profile, evaluation, templates, prep
│       ├── job-scraper/                   # Job search orchestration
│       ├── upskill/                       # Skill gap analysis + learning plans
│       ├── profile-fetcher/               # GitHub/LinkedIn/blog/CV profile extraction
│       ├── profile-feedback/              # Reasoning feedback loop
│       └── reasoning-log/                 # Decision audit trail
├── .agents/skills/                        # Job portal CLI tools
│   ├── alljobs-search/                    # 🇮🇱 AllJobs.co.il
│   ├── drushim-search/                    # 🇮🇱 Drushim.co.il
│   ├── jobmaster-search/                  # 🇮🇱 JobMaster.co.il
│   ├── jobbank-search/                    # 🇩🇰 Akademikernes Jobbank
│   ├── jobdanmark-search/                 # 🇩🇰 Jobdanmark.dk
│   ├── jobindex-search/                   # 🇩🇰 Jobindex.dk
│   ├── jobnet-search/                     # 🇩🇰 Jobnet.dk (government portal)
│   ├── salary-search/                     # 💰 BYO salary data benchmarking
│   └── job-scraper/                       # 🔄 Search orchestration
├── scripts/                                # TypeScript CLI toolchain
│   ├── api/                               # REST API server + web dashboard
│   │   ├── server.ts                      # 9 endpoints, timing-safe auth
│   │   └── public/                        # Static dashboard files
│   ├── build/                             # Document build CLI (Typst + LaTeX)
│   ├── generate/                          # Cover letter + email + portfolio generators
│   │   ├── cover-letter.ts                # Heuristic draft, Typst → PDF (grouped skills)
│   │   ├── email.ts                       # Follow-up, thank-you, withdraw, referral
│   │   └── portfolio.ts                   # Profile → static HTML (3 templates)
│   ├── jobs/                              # Job analysis tools
│   │   ├── summarize.ts                   # JD → structured JSON
│   │   ├── alerts.ts                      # Unreviewed job alerts
│   │   ├── market.ts                      # Market demand snapshots
│   │   └── interview-prep.ts             # Prep sheets from posting + profile
│   ├── match/                             # Scoring engines
│   │   ├── score-job.ts                   # 0-100 fit scorer (weighted dimensions)
│   │   └── template-engine.ts             # Multi-factor template intelligence
│   ├── mcp/                               # MCP server
│   │   └── server.ts                      # 13 tools, Zod-validated
│   ├── pipeline/                          # Pipeline orchestrator
│   │   └── cli.ts                         # 6 commands, resumable state
│   └── profile/                           # Profile management
│       ├── build-profile.ts               # Profile builder
│       ├── fetch-github.ts                # GitHub profile extraction
│       ├── fetch-linkedin.ts              # LinkedIn extraction
│       ├── fetch-blog.ts                  # Blog/portfolio extraction
│       ├── parse-cv.ts                    # CV parser
│       ├── merge.ts                       # Profile merge
│       ├── reason.ts                      # Reasoning engine
│       ├── outcome.ts                     # Outcome recorder
│       ├── feedback.ts                    # Feedback processor
│       └── sync-claude.ts                 # CLAUDE.md synchronizer
├── src/                                    # Shared modules
│   ├── schemas.ts                         # Zod schemas for all data models
│   ├── profile-schemas.ts                 # Profile-specific schemas
│   ├── tracker.ts                         # SQLite tracker (WAL mode, column-validated updates)
│   ├── naming.ts                          # Application ID generation
│   ├── portfolio-templates.ts             # Portfolio template registry + shared render helpers
│   ├── resolve-bin.ts                     # External binary resolution (typst, pdftotext, etc.)
│   └── stdin.ts                           # Cross-platform stdin reader
├── templates/                             # Document templates
│   ├── cv/                                # academic · banking · creative · modern (Typst)
│   ├── cover/                             # casual · classic · modern (Typst)
│   ├── portfolio/                         # showcase (project warehouse) · modern · minimal · terminal (HTML)
│   └── design-system.typ                  # Shared Typst design tokens
├── data/                                  # Runtime data (mostly gitignored)
│   └── config.json                        # Configuration
├── tests/                                 # 93 unit tests (bun:test, strict-mode)
├── specs/                                 # Architecture specs
├── Dockerfile                             # Bun-based API container
├── docker-compose.yml                     # app + scraper services
└── .github/workflows/ci.yml              # CI: typecheck + test on push/PR
```

---

## Data Flow

### Profile Pipeline

```
/setup or documents/ → Profile sources (CV, LinkedIn, GitHub, blog)
                        ↓
                    Profile extraction (scripts/profile/)
                        ↓
                    data/profile.json (structured, Zod-validated)
                        ↓
                    CLAUDE.md + skill files synchronized
```

### Application Pipeline

```
Traceable job URL/text + observed date → Summarize → Score capability + eligibility
                                                       ↓
                                      Human selects an eligible/review role
                                                       ↓
                              Evidence contract → Application plan → Draft → Evidence review
                                                       ↓
                              Render current Typst source → mandatory recompile
                                                       ↓
                     Raster layout safety + ATS text layer + naming → local pilot / final
                                                       ↓
             Human submission approval → data/tracker.db (only confirm-gated writes)
```

`data/profile.json` is the structured runtime source of truth. A legacy CV, `CLAUDE.md`, lab activity, adjacent skills, or personal projects must not become employment evidence by default. `scripts/match/score-job.ts` reports capability score and work eligibility separately so a hard work-preference constraint never hides a role's genuine technical fit. See [Evidence-Grounded Job Pilot](workflows/evidence-grounded-job-pilot.md) for the full current procedure.

### Scrape Pipeline

```
Portal CLIs → Raw results → Deduplication → data/seen-jobs.json
                                                ↓
                                        /rank (batch scoring)
                                                ↓
                                        Ranked shortlist → /apply
```

---

## Integration Surfaces

### MCP Server (`bun run mcp`)

Stdio JSON-RPC transport. 13 typed tools, Zod-validated at the boundary. Write operations gated behind an enforceable `confirm: true` schema parameter.

| Tool | Kind | Description |
|:-----|:-----|:------------|
| `get_profile` | Read | Candidate profile JSON |
| `list_jobs` | Read | Deduped scraped jobs (status/market filters) |
| `list_applications` | Read | Tracker rows (status/company filters) |
| `get_analytics` | Read | Pipeline dashboard data |
| `pending_followups` | Read | Applications due for follow-up |
| `score_job` | Read | 0-100 fit score with matched requirements, exact profile-skill evidence, gaps, neutral factors, and separate work-preference eligibility (`eligible`, `ineligible`, or `review`) |
| `add_application` | **Write** | Insert tracker row (requires `confirm: true`) |
| `update_application_status` | **Write** | Status change (requires `confirm: true`) |

Plus one resource: `jobsearch://reports/latest` (latest weekly report, markdown).

### REST API (`bun run api`)

`http://127.0.0.1:8317` — set `API_KEY` in `.env` for authenticated access.

| Endpoint | Method | Description |
|:---------|:-------|:------------|
| `/` | GET | Web dashboard |
| `/api/profile` | GET | Candidate profile |
| `/api/jobs` | GET | Scraped jobs |
| `/api/applications` | GET | Tracked applications |
| `/api/applications` | POST | Add new application |
| `/api/applications/:id` | PATCH | Update status |
| `/api/analytics` | GET | Pipeline stats |
| `/api/reasoning` | GET | Decision reasoning log |
| `/api/score` | POST | Score a job description (200 KB limit) |

Security: timing-safe API-key comparison, `X-Content-Type-Options: nosniff`, binds 127.0.0.1 only.

### External Agent Setup

```bash
# Claude Code
claude mcp add job-search -- bun run scripts/mcp/server.ts

# Hermes Agent — add to ~/.hermes/config.yaml under mcp_servers:
job-search:
  command: bun
  args: ["run", "<ABSOLUTE_PATH>/scripts/mcp/server.ts"]

# OpenClaw — register via CLI:
openclaw mcp add job-search --command bun --arg run --arg <ABSOLUTE_PATH>/scripts/mcp/server.ts
```

Both Hermes Agent v0.18.2 and OpenClaw 2026.6.11 are verified working — 13 tools discovered by each.

See [AGENTS-INTEGRATION.md](../AGENTS-INTEGRATION.md) for the full setup guide.

---

## Security Posture

- **Read-mostly**: 6 of 8 MCP tools are read-only; the 2 writes are additive/status-level only
- **No destructive operations**: No delete, no file write, no shell, no generic pass-through tool
- **Zod-validated inputs**: All tool and API inputs validated at the boundary
- **Column-validated updates**: `Tracker.update()` whitelists allowed column names via `ALLOWED_COLUMNS` set — prevents SQL injection through dynamic field names
- **Confirm-gated writes**: Verified rejections for missing `confirm` parameter
- **Network isolation**: MCP uses stdio (no network bind); REST binds 127.0.0.1 only
- **Profile protection**: No external surface exposes CLAUDE.md regeneration or profile mutation

---

## Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Runtime** | [Bun](https://bun.sh) |
| **Language** | TypeScript (ESNext, strict mode, bundler module resolution) |
| **AI Agent** | [Claude Code](https://claude.com/claude-code) CLI |
| **Document Compilation** | LaTeX (`lualatex` + `xelatex`) · [Typst](https://typst.app) |
| **Data Validation** | [Zod](https://zod.dev) ^3.25 |
| **Database** | SQLite (WAL mode, via Bun built-in) |
| **Agent Protocol** | [Model Context Protocol (MCP)](https://modelcontextprotocol.io) ^1.29 |
| **Containerization** | Docker + Docker Compose |
| **CI/CD** | GitHub Actions (typecheck + test on push/PR) |
| **Testing** | `bun:test` (93 tests, strict-mode) |
