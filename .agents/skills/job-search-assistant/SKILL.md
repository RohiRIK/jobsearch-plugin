---
name: job-search-assistant
description: "Route job-search requests to the plugin's workflow skills. USE WHEN setting up a job-search workspace, finding or scoring roles, tailoring applications, recording outcomes, or maintaining the job-search system. NOT FOR unrelated coding tasks."
---

# Job-search workflow router (for hosts that read `.agents/skills`)

## Agent-first rule

The user talks to you; you run the workflow. Never ask the user to execute a
project command as the next step. Interpret natural language directly:

- "Set up my profile" → `init`
- "Find me jobs" / "search for roles" / "rank these" → `research`
- "Apply to this posting" / "make my CV" → `cv`
- "They replied" / "record the outcome" → `outcome`
- "Is my install healthy?" / "add a command" / "release it" → `manage`

Ask only for missing personal facts or explicit approval before writes.

From the repository root, read the selected skill before acting. These are the
same files every host loads from the `job-search/` plugin; this router adds no
alternative instructions:

- Setup and profile onboarding: `job-search/skills/init/SKILL.md`
- Search, fit and market research: `job-search/skills/research/SKILL.md`
- CV and cover-letter drafting: `job-search/skills/cv/SKILL.md`
- Application outcomes and pipeline: `job-search/skills/outcome/SKILL.md`
- Operating and extending the system: `job-search/skills/manage/SKILL.md`

Every command runs through `job-search/scripts/jobsearch` (one JSON envelope per
call; `--help-json` lists them). The MCP server is registered in `opencode.json`.
Follow the selected skill's confirmation and verification gates.
