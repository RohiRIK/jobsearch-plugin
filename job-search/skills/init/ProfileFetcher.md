> Context file of the `init` skill — `jobsearch`, `<workspace>` and `<assistant>` are defined in its SKILL.md.

# Profile Fetcher

Populate and maintain the candidate profile from external data sources. The profile is the foundation of every job application — it feeds into CV tailoring, cover letter writing, and fit evaluation.

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **BuildProfile** | "build profile", "populate profile", "fetch profile data" | `Workflows/BuildProfile.md` |
| **FetchGithub** | "fetch github", "pull github data" | `Workflows/FetchGithub.md` |
| **ParseCv** | "parse cv", "extract cv data", "import cv" | `Workflows/ParseCv.md` |
| **SyncClaude** | "sync claude", "update CLAUDE.md" | `Workflows/SyncClaude.md` |

## Quick Reference

- Profile data lives in `<workspace>/data/profile.json` (canonical source of truth)
- Staging files in `<workspace>/data/staging/` — each fetcher writes here
- `<workspace>/data/profile-schemas.ts` — Zod schemas for validation
- `<workspace>/data/config.json` — GitHub username, name, directories
- `CLAUDE.md` — regenerated from profile.json by sync-claude

## Commands

```bash
# Full pipeline
bun run scripts/profile/build-profile.ts

# Individual fetchers
bun run scripts/profile/fetch-github.ts [username]
bun run scripts/profile/fetch-blog.ts <url>
bun run scripts/profile/fetch-linkedin.ts --manual
bun run scripts/profile/parse-cv.ts <path-to-cv.tex>

# Merge and sync
bun run scripts/profile/merge.ts
bun run scripts/profile/sync-claude.ts
```

## Gotchas

- LinkedIn scraping is blocked by auth walls — always use `--manual` to create a fillable template
- Blog RSS detection tries `/feed`, `/rss`, `/atom.xml` — if none found, falls back to HTML `<article>` extraction (best-effort)
- CV parser handles moderncv `\cventry` format — other LaTeX formats may need adapter code
- Placeholder tokens (`[YOUR_NAME]`) in LaTeX files are automatically excluded from parsed output
- Merge deduplicates by title+company (experience) and degree+institution (education)
- Re-running any fetcher overwrites its staging file (idempotent)

## Examples

**Example 1: Build profile from scratch**
```
User: "Build my profile from GitHub"
→ FetchGithub fetches api.github.com/users/<githubUsername> → <workspace>/data/staging/github.json
→ Merge combines staging → <workspace>/data/profile.json
→ SyncClaude regenerates CLAUDE.md Candidate Profile section
```

**Example 2: Parse existing CV**
```
User: "Parse my CV at assets/cv/main_example.tex"
→ ParseCv extracts identity, experience, education, skills → <workspace>/data/staging/cv.json
→ User runs merge to incorporate into profile
```
