<p align="center">
  <img src="assets/readme/hero.jpg" alt="AI Job Search — Your Automated Career Co-pilot" width="720">
</p>

<h1 align="center">AI Job Search</h1>

<p align="center">
  <strong>An intelligent, autonomous job hunting ecosystem for Claude Code, Hermes, OpenClaw, and any MCP-compatible agent.</strong>
  <br />
  Provide your career details once, and let your AI agent handle the heavy lifting: discovering opportunities, evaluating your fit, forging tailored CVs and cover letters, and even prepping you for the interview.
</p>

<p align="center">
  <a href="https://github.com/RohiRIK/jobsearch-plugin/actions/workflows/ci.yml">
    <img src="https://github.com/RohiRIK/jobsearch-plugin/actions/workflows/ci.yml/badge.svg" alt="Build Status">
  </a>
  <img src="https://img.shields.io/badge/Powered_by-Bun-f9f1e1?logo=bun&logoColor=000" alt="Bun">
  <img src="https://img.shields.io/badge/Written_in-TypeScript-3178c6?logo=typescript&logoColor=fff" alt="TypeScript">
  <img src="https://img.shields.io/badge/Agent_Ready-Any_MCP_Client-d4a574?logo=anthropic&logoColor=fff" alt="Any MCP Agent">
  <img src="https://img.shields.io/badge/Integration-MCP-6366f1" alt="Model Context Protocol">
  <img src="https://img.shields.io/badge/Output-Typst_%2B_LaTeX-239dad" alt="Typst and LaTeX">
  <a href="https://github.com/RohiRIK/jobsearch-plugin/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-22c55e" alt="MIT License">
  </a>
</p>

<br />

> [!NOTE]
> This is a community-driven open-source project. **It is not sponsored, endorsed, or affiliated with Anthropic**. The workflow relies on the Model Context Protocol (MCP), allowing you to use Claude Code, Hermes, OpenClaw, or any other compatible AI engine.

---

## 📌 Project Overview

**AI Job Search** is an advanced, systematic pipeline designed to turn **any MCP-compatible agent** (like Claude Code, Hermes, or OpenClaw) into your personal, full-stack recruitment assistant. Rather than wasting hours drafting repetitive cover letters and manually tweaking your CV, you establish your professional profile a single time. From there, the system automatically assesses job descriptions, generates highly customized application materials, runs multi-agent peer reviews, compiles flawless PDFs, verifies them against ATS parsers, and equips you for interviews.

```
 /setup             /scrape                /apply <url>
   │                   │                       │
   ▼                   ▼                       ▼
 Ingest your        Scan job boards        Analyze JD fit
 career history     concurrently           Generate match score
   │                   │                       │
   ▼                   ▼                       ▼
 Unified profile    Display curated        Construct unique CV
 dataset created    opportunities          & Cover Letter (PDF)
                       │                       │
                       ▼                       ▼
                    Select target          Peer-agent review
                    → /apply               → Polish → Final Output
```

The underlying architecture — **candidate ingestion → algorithmic fit analysis → multi-agent drafting** — is entirely **global and language-agnostic**. Out of the box, our scraping tools support the Israeli market (AllJobs, Drushim, JobMaster), the Danish market (Jobbank, Jobdanmark, Jobindex, Jobnet), EU/US/remote boards (Arbeitnow, Remote OK, Remotive, We Work Remotely), and the global LinkedIn ecosystem. You can easily hook into your own local job boards using the `/add-portal` utility.

### 🍴 Fork Lineage

This repository is a **fork** of the excellent [**MadsLorentzen/ai-job-search**](https://github.com/MadsLorentzen/ai-job-search) established by [Mads Lorentzen](https://github.com/MadsLorentzen).

This enhanced edition introduces major upgrades over the upstream version:

| Enhancement | Description |
|:------------|:------------|
| **Smart CV Templating** | A sophisticated, multi-variable heuristic engine that grades templates based on industry, formality, RTL requirements, role alignment, and your seniority. |
| **Document Forging** | Typst-powered cover letter creation, alongside automated generators for follow-ups, thank-yous, and withdrawal emails. |
| **Strategic Insights** | An integrated interview preparation engine, background job alert monitors, and historical market intelligence tracking. |
| **Robust Infrastructure** | Complete with a REST API, web-based dashboard, typed MCP server, Dockerization, and seamless GitHub Actions CI. |
| **Autonomous Agents** | Out-of-the-box MCP integration tested and verified with Hermes Agent and OpenClaw. |
| **Testing** | An expanding Bun test suite validates document contracts, template algorithms, fit scoring, profile merging, portfolio generation, and Typst compilation. |

---

## ✨ Core Capabilities

- 🎯 **Dual-Agent Drafting System** — Employs a writer-and-critic paradigm. Includes visual PDF inspection, strict ATS formatting checks, and dynamic, relevance-based bullet point trimming for CVs.
- 📄 **Flawless Document Generation** — Automatically compiles and visually audits your LaTeX and Typst templates.
- 🔍 **Expansive Job Scraping** — Built-in support for 12 platforms spanning Israel, Denmark, the EU, US/remote boards (Remote OK, Remotive, Arbeitnow, We Work Remotely), and global LinkedIn.
- 🧠 **Algorithmic Template Selection** — Evaluates available templates against 6 weighted criteria to ensure perfect visual alignment with the job posting.
- 📊 **Career Command Center** — Includes a unified dashboard, gap analysis tools, market trend tracking, and automated follow-up reminders.
- 🤖 **Developer-Ready APIs** — Exposes typed MCP tools, resources, and an application prompt for external agents, plus REST endpoints for bespoke web integrations.
- 🐳 **Containerized Deployments** — Fully Dockerized API services and standalone scraper scripts.
- ✅ **Continuous Integration** — Automated type-checking and testing via GitHub Actions.

---

## 🚀 Jump In

### Environment Requirements

| Dependency | Installation Resource |
|:-----------|:----------------------|
| **An MCP-Ready AI Agent** (e.g. Claude Code, Hermes, OpenClaw) | Agent's respective installation guide |
| **[Bun](https://bun.sh)** | `curl -fsSL https://bun.sh/install \| bash` |
| **LaTeX Environment** (`lualatex`, `xelatex`) | [TeX Live](https://tug.org/texlive/) or [MiKTeX](https://miktex.org/) |
| `pdftotext` *(required to ship documents)* | Mac: `brew install poppler` · Linux: `apt install poppler-utils` |

### Setup Steps

```bash
# 1. Grab the repository
git clone https://github.com/RohiRIK/jobsearch-plugin.git
cd jobsearch-plugin

# 2. Install core packages
bun install

# 3. Initialize job board scrapers
for tool in alljobs-search drushim-search jobmaster-search jobbank-search jobdanmark-search jobindex-search jobnet-search remoteok-search remotive-search arbeitnow-search wwr-search; do
  cd .agents/skills/$tool/cli && bun install && cd ../../../..
done

# 4. Launch your agent & build your profile
# Example with Claude Code:
claude
# Once inside the prompt (trust the folder so the job-search plugin loads), type:
/job-search:setup
```

> **Commands are namespaced by the plugin.** `/setup`, `/apply`, `/rank` … are `/job-search:setup`, `/job-search:apply`, `/job-search:rank` — the workflows moved into the self-contained `job-search/` plugin, which also installs on Hermes, OpenCode, OpenClaw and Pi (`job-search/scripts/jobsearch hosts-install --host <host> --dry-run`). See [docs/AGENTS-INTEGRATION.md](docs/AGENTS-INTEGRATION.md).

### Launch an Application

```bash
# Claude Code
/job-search:apply https://jobindex.dk/job/1234567

# Any agent or host: one-call triage, then the shared workflow
job-search/scripts/jobsearch triage --job data/jd/<company>.txt
job-search/scripts/jobsearch --help-json
```

The shared workflow is [Evidence-Grounded Job Pilot](docs/workflows/evidence-grounded-job-pilot.md): preserve a traceable source, score capability fit separately from eligibility, prepare an evidence contract, draft/review against evidence IDs, render, run the current-template gate, and inspect every final raster page. The MCP equivalents are `prepare_application`, `review_application_draft`, and the user-invoked `tailor_application` prompt.

### Quickstart by persona

| You are… | Start here |
|:---------|:-----------|
| **Job seeker (daily use)** | `/scrape` → `/rank` → `/apply <url>` in Claude Code. Between applications: `bun run dashboard`, `bun run alerts list`, `bun run followup pending`. Record results with `/outcome`. |
| **Agent integrator** (Hermes, Claude Code, OpenCode, Pi; approval-required OpenClaw) | Use the [project-local multi-host guide](docs/AGENTS-INTEGRATION.md). Do not run the legacy umbrella installer for local activation: it mutates user-level Hermes/OpenClaw configuration and requires explicit approval. MCP tracker writes are confirm-gated; document preparation and review are read-only. |
| **Developer** | `bun install` → `bunx tsc --noEmit && bun test tests/`. Code map in [AGENTS.md](AGENTS.md); work queue in [docs/planning/BACKLOG.md](docs/planning/BACKLOG.md). CI runs strict-mode typecheck + tests on every push. |

**Document quality gates**: `bun run application review` validates evidence-grounded LLM text before rendering; `bun run naming check` enforces `<Name>_<Company>_<Role>_<CV|CL>` filenames; `bun run reevaluate --company X --role Y --market <code>` always recompiles current Typst imports, then gates the selected market's CV page budget (cover letter = 1), 192-PPI raster layout safety, ATS text layer, and naming. Visual inspection remains mandatory. `--allow-missing-ats` is a non-shipping local-pilot mode only: ATS must be reported as unverified, never passed.

### Troubleshooting

| Symptom | Fix |
|:--------|:----|
| `hermes mcp test job-search` fails | Hermes MCP is not auto-registered by the portable plugin. Inspect the chosen profile's existing MCP registration and the repo's absolute path; request approval before changing user-level config. See [integration guide](docs/AGENTS-INTEGRATION.md). |
| Tools report `NO_PROFILE` / `NO_DATA` | Expected on fresh clones — personal data is gitignored. Run `bun run profile`, then `bun run pipeline:scrape` |
| `reevaluate` fails the ATS gate | `brew install poppler` (pdftotext); icon-only contact lines are invisible to ATS — keep email/phone as literal text |
| Container API unreachable | Server binds `HOST` env (0.0.0.0 in Docker); host mapping stays `127.0.0.1:8317` |
| GitHub fetch 403 | Set `GITHUB_TOKEN` in `.env` (fine-grained, public-repo read-only) |

---

## 📖 Deep-Dive Documentation

| Resource | Contents |
|:---------|:---------|
| **[Comprehensive Usage Guide](docs/usage.md)** | Full breakdown of all commands, the CLI pipeline, and Docker instructions. |
| **[Inside the `/apply` Pipeline](docs/apply-workflow.md)** | The current evidence-grounded drafting, gating, and submission-boundary process. |
| **[Evidence-Grounded Job Pilot](docs/workflows/evidence-grounded-job-pilot.md)** | Reusable real-posting workflow, source ledger, eligibility, visual/ATS gates, and improvement backlog. |
| **[System Architecture](docs/architecture.md)** | Codebase topography, data lifecycles, and API/MCP capabilities. |
| **[Customizing Your Setup](docs/customization.md)** | Guides on integrating new templates, bespoke job portals, and salary data. |
| **[Initial Setup Walkthrough](SETUP.md)** | Granular installation and prerequisite instructions. |
| **[External Agent Integration](docs/AGENTS-INTEGRATION.md)** | Project-local Hermes Agent, Claude Code, OpenCode, and Pi setup; approval-required OpenClaw/Hermes integration, MCP inventory, REST/auth and security posture. |
| **[Version History](CHANGELOG.md)** | Detailed log of updates, fixes, and new features. |
| **[Future Roadmap](ROADMAP.md)** | Upcoming milestones and planned development phases. |

---

## 🏗️ Technology Matrix

| Component | Tooling |
|:----------|:--------|
| **Execution Engine** | [Bun](https://bun.sh) |
| **Codebase** | TypeScript (ESNext) |
| **Agent Interface** | Any MCP Client (Claude Code, Hermes, OpenClaw, etc.) |
| **Typesetting** | LaTeX (`lualatex` / `xelatex`) & [Typst](https://typst.app) |
| **Schema Validation** | [Zod](https://zod.dev) (^3.25) |
| **Storage** | SQLite (running in WAL mode) |
| **Agent Connectivity** | [Model Context Protocol (MCP)](https://modelcontextprotocol.io) (^1.29) |
| **Virtualization** | Docker & Docker Compose |
| **Automation** | GitHub Actions |
| **Testing Framework** | `bun:test` |

---

## 🤝 Get Involved

1. **Fork** this repository.
2. **Branch** off for your feature (`git checkout -b feature/your-brilliant-idea`).
3. **Develop** your changes (our CI runs `bunx tsc --noEmit` and `bun test tests/` automatically).
4. **Commit** using standard [Conventional Commits](https://www.conventionalcommits.org/) formatting (`feat:`, `fix:`, `docs:`, etc.).
5. **Submit** a Pull Request for review!

---

## 📄 Licensing Information

Licensed under the [MIT License](LICENSE) — Copyright (c) 2026 [Mads Lorentzen](https://github.com/MadsLorentzen).

---

## 🙏 Credits & Gratitude

- Core concept and original repository by [Mads Lorentzen](https://github.com/MadsLorentzen) — [view the upstream project here](https://github.com/MadsLorentzen/ai-job-search).
- AI capabilities driven by [Claude Code](https://claude.com/claude-code), Hermes, OpenClaw, or your preferred MCP client.
- ☕ [Consider buying the original author a coffee on Ko-fi!](https://ko-fi.com/madslorentzen)
