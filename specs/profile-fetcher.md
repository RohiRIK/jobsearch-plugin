# Profile Fetcher

## What this builds

A CLI tool that populates the candidate profile from external sources (GitHub, LinkedIn, blog, CVs), keeps `CLAUDE.md` in sync, and tracks what works through a reasoning feedback loop. The entire job application pipeline depends on structured candidate data — today it lives in `[PLACEHOLDER]` tokens.

## Why reasoning is included

A document generator produces CVs. A career strategy tool learns. Every application outcome feeds back: apply → track → reason → adjust profile → apply better. The reasoning layer connects evidence (specific applications) to findings (what works) to actions (profile changes). Confidence levels prevent premature optimization — a hunch with 1 data point is `low`, a pattern across 10+ applications is `high`.

## Existing codebase

| File | Relevance |
|------|-----------|
| `CLAUDE.md:14-77` | Profile schema (all `[PLACEHOLDER]` tokens) |
| `data/schemas.ts` | Zod patterns to follow (no profile schema yet) |
| `data/config.json` | Name (e.g. "Jane-Doe"), dirs, separators |
| `.agents/skills/alljobs-search/cli/src/cli.ts` | CLI pattern: parseFlags, JSON stdout, error objects |
| `assets/cv/main_example.tex` | Parseable LaTeX: `\cventry`, `\section`, `\name`, `\email` |
| `scripts/build/cli.ts` | Build CLI pattern: config + command dispatch |

## Design decisions

1. **GitHub API is public** — no auth needed. Use `api.github.com/users/{username}` + `/users/{username}/repos`.
2. **LinkedIn has auth walls** — manual input is the reliable path. Attempt web fetch on failure, print guidance.
3. **Blog scraping** — RSS first (`/feed`, `/rss`, `/atom.xml`), HTML `<article>` extraction as fallback.
4. **LaTeX CV parsing** — regex extraction of `\name`, `\email`, `\phone`, `\cventry`, `\section`. Sufficient for bootstrapping; not perfect.
5. **Profile is source of truth** — `data/profile.json` is canonical. `CLAUDE.md` regenerates from it. Never edit CLAUDE.md by hand after initial populate.
6. **Staging pattern** — each fetcher writes independently to `data/staging/`. Merge deduplicates and produces `data/profile.json`.
7. **Reasoning is first-class** — the reasoning log connects evidence → findings → actions. This is what separates a document generator from a career strategy tool.
8. **Confidence forces honesty** — every reasoning entry requires a confidence level, preventing premature optimization from thin evidence.

## Data model

### Profile schema (`data/profile-schemas.ts`)

```typescript
const Identity = z.object({
  name: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  country: z.string().optional(),
  languages: z.array(z.string()).optional(),
  linkedin: z.string().url().optional(),
  github: z.string().url().optional(),
  blog: z.string().url().optional(),
  headline: z.string().optional(),
  status: z.string().optional(),
});

const Education = z.object({
  degree: z.string(),
  field: z.string(),
  institution: z.string(),
  location: z.string().optional(),
  startYear: z.number().optional(),
  endYear: z.number().optional(),
  thesis: z.string().optional(),
  topics: z.array(z.string()).optional(),
});

const Experience = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  responsibilities: z.array(z.string()).optional(),
  achievements: z.array(z.string()).optional(),
});

const SkillCategory = z.object({
  category: z.string(),
  skills: z.array(z.string()),
});

const Profile = z.object({
  identity: Identity,
  education: z.array(Education).optional(),
  experience: z.array(Experience).optional(),
  skills: z.array(SkillCategory).optional(),
  certifications: z.array(z.object({
    name: z.string(),
    hours: z.number().optional(),
    date: z.string().optional(),
  })).optional(),
  publications: z.array(z.object({
    authors: z.string(),
    year: z.number(),
    title: z.string(),
    journal: z.string(),
    doi: z.string().optional(),
  })).optional(),
  awards: z.array(z.object({
    name: z.string(),
    event: z.string(),
    year: z.number(),
  })).optional(),
  behavioral: z.object({
    traits: z.array(z.object({ trait: z.string(), description: z.string() })).optional(),
    strengths: z.array(z.string()).optional(),
    growthAreas: z.array(z.string()).optional(),
    idealEnvironment: z.string().optional(),
  }).optional(),
  excites: z.array(z.string()).optional(),
  targetSectors: z.array(z.object({
    sector: z.string(),
    companies: z.array(z.string()),
  })).optional(),
  dealBreakers: z.array(z.string()).optional(),
  sources: z.object({
    github: z.boolean().optional(),
    linkedin: z.boolean().optional(),
    blog: z.boolean().optional(),
    cv: z.boolean().optional(),
    manual: z.boolean().optional(),
  }).optional(),
  lastFetched: z.string().datetime().optional(),
});
```

### Reasoning schema (`data/profile-schemas.ts`)

```typescript
const ApplicationOutcome = z.object({
  applicationId: z.string(),
  company: z.string(),
  role: z.string(),
  sector: z.string().optional(),
  channel: z.string(),
  templateUsed: z.string().optional(),
  coverLetterUsed: z.boolean().optional(),
  status: ApplicationStatus,
  responseTimeDays: z.number().optional(),
  interviewCount: z.number().int().optional(),
  rejectionReason: z.string().optional(),
  notes: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const ReasoningEntry = z.object({
  id: z.string().regex(/^reason_\d{8}_[a-z0-9-]+$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum([
    "channel_effectiveness",
    "template_effectiveness",
    "skill_gap",
    "sector_fit",
    "cover_letter_style",
    "timing",
    "general",
  ]),
  finding: z.string(),
  evidence: z.array(z.object({
    applicationId: z.string().optional(),
    data: z.string(),
  })),
  confidence: z.enum(["low", "medium", "high"]),
  actionItem: z.string().optional(),
  applied: z.boolean().default(false),
});

const ReasoningLog = z.object({
  entries: z.array(ReasoningEntry),
  summary: z.object({
    totalApplications: z.number().int(),
    responseRate: z.number(),
    interviewRate: z.number(),
    offerRate: z.number(),
    bestChannel: z.string().optional(),
    bestTemplate: z.string().optional(),
    avgResponseDays: z.number().optional(),
    topRejectionReasons: z.array(z.string()).optional(),
    lastAnalyzed: z.string().datetime().optional(),
  }).optional(),
});
```

## Acceptance criteria

### Phase 1: Data model

**AC 1.1** — `data/profile-schemas.ts` exports `Profile`, `Identity`, `Education`, `Experience`, `SkillCategory`, `ApplicationOutcome`, `ReasoningEntry`, `ReasoningLog` schemas. `bunx tsc --noEmit` passes with no errors.

**AC 1.2** — `data/config.json` gains a `githubUsername` field (no default; the user sets it).

### Phase 2: GitHub fetcher

**AC 2.1** — Given username `octocat`, when running `bun run scripts/profile/fetch-github.ts octocat`, then `data/staging/github.json` is created with shape:

```json
{
  "name": "Rohi Rikman",
  "email": null,
  "location": "Israel",
  "blog": "https://...",
  "bio": "...",
  "repos": [{ "name": "repo-name", "description": "...", "language": "TypeScript", "stars": 5, "url": "https://..." }],
  "languages": { "TypeScript": 12000, "Python": 3000 }
}
```

**AC 2.2** — Given an invalid username, when fetched, then stderr receives `{"error":"User not found","code":"NOT_FOUND"}` and exit code is 1.

**AC 2.3** — Given no username arg, when `data/config.json` has `githubUsername`, then that value is used. When it is missing, then stderr receives `{"error":"No username provided","code":"NO_USERNAME"}` and exit code is 1.

### Phase 3: LinkedIn fetcher

**AC 3.1** — Given a LinkedIn profile URL, when `bun run scripts/profile/fetch-linkedin.ts https://linkedin.com/in/...`, then `data/staging/linkedin.json` is created with: name, headline, location, experience (title, company, dates), education, skills.

**AC 3.2** — Given LinkedIn blocks scraping, when fetch fails, then stderr receives a message explaining the manual fallback and exit code is 1.

**AC 3.3** — Given `--manual`, when run, then `data/staging/linkedin-manual.json` is created with a fillable template covering all profile fields.

### Phase 4: Blog fetcher

**AC 4.1** — Given a blog URL with RSS at `/feed`, when `bun run scripts/profile/fetch-blog.ts https://example.com`, then `data/staging/blog.json` is created with:

```json
{
  "posts": [{ "title": "...", "date": "2026-01-15", "summary": "...", "url": "https://..." }]
}
```

**AC 4.2** — Given no RSS feed, when HTML is fetched, then articles are extracted from `<article>` or `<h2>` patterns. Extraction is best-effort; partial results are accepted.

**AC 4.3** — Given an unreachable URL, then stderr receives `{"error":"...","code":"FETCH_FAILED"}` and exit code is 1.

### Phase 5: CV parser

**AC 5.1** — Given `assets/cv/main_example.tex`, when `bun run scripts/profile/parse-cv.ts assets/cv/main_example.tex`, then `data/staging/cv.json` is created with: identity (name, email, phone, linkedin, github), education, experience, skills, languages, publications, awards.

**AC 5.2** — Given placeholder tokens (`[YOUR_NAME]`), when parsed, then those values are omitted from output (not included as literal strings).

**AC 5.3** — Given a file with `\cventry{2020--Present}{Data Scientist}{Google}{Tel Aviv}{}{...}`, when parsed, then the entry is extracted as `{ title: "Data Scientist", company: "Google", location: "Tel Aviv", startDate: "2020", endDate: null }`.

### Phase 6: Merge + CLAUDE.md sync

**AC 6.1** — Given staging files in `data/staging/`, when `bun run scripts/profile/merge.ts`, then `data/profile.json` is created and validates against the `Profile` schema.

**AC 6.2** — Given overlapping data from multiple sources, when merged, then later sources override scalars for the same field; arrays are concatenated and deduplicated by title+company or degree+institution.

**AC 6.3** — Given `data/profile.json`, when `bun run scripts/profile/sync-claude.ts`, then the Candidate Profile section of `CLAUDE.md` (lines 14-77) is replaced with actual data. The Role, Repo Structure, Workflow, and Verification Checklist sections remain unchanged.

### Phase 7: Pipeline CLI

**AC 7.1** — When `bun run scripts/profile/build-profile.ts` runs, then the pipeline executes: fetch-github → fetch-blog → merge → sync-claude. LinkedIn and CV parsing are opt-in via `--linkedin` and `--cv <path>` flags.

**AC 7.2** — When the pipeline completes, then stdout receives a summary: sources used, profile.json created, CLAUDE.md updated, fields populated count.

### Phase 8: Outcome tracking

**AC 8.1** — Given `bun run scripts/profile/outcome.ts set app_20260701_leumi --status rejected --reason "lacked fintech experience" --response-days 14`, when run, then the application status is updated and a reasoning prompt is printed: "This rejection cited 'lacked fintech experience'. Is this a skill gap? Record a reasoning entry with `reason log --type skill_gap`."

**AC 8.2** — Given `bun run scripts/profile/outcome.ts bulk --from outcomes.csv`, when run, then all rows are processed and a summary is printed.

**AC 8.3** — Given an unknown application ID, when `outcome set` runs, then stderr receives `{"error":"Application not found","code":"NOT_FOUND"}` and exit code is 1.

### Phase 9: Reasoning log

**AC 9.1** — Given `bun run scripts/profile/reason.ts log --type template_effectiveness --finding "Banking template gets 3x more responses in finance" --evidence "app_20260701_leumi: 2 responses" --confidence high`, when run, then a `ReasoningEntry` is appended to `data/reasoning.json`.

**AC 9.2** — Given `bun run scripts/profile/reason.ts analyze`, when run, then all applications are scanned, summary stats are computed (response rate, interview rate, best channel, best template, avg response time), and written to `data/reasoning.json`.

**AC 9.3** — Given `bun run scripts/profile/reason.ts query --type skill_gap`, when run, then all matching entries are returned as JSON to stdout.

**AC 9.4** — Given `bun run scripts/profile/reason.ts summary`, when run, then summary stats are printed to stdout as JSON.

### Phase 10: Feedback engine

**AC 10.1** — Given `bun run scripts/profile/feedback.ts gaps`, when run, then skill gaps mentioned in 2+ rejections with confidence ≥ medium are listed.

**AC 10.2** — Given `bun run scripts/profile/feedback.ts channels`, when run, then job boards are ranked by response rate with evidence.

**AC 10.3** — Given `bun run scripts/profile/feedback.ts templates`, when run, then CV templates are ranked by response rate.

**AC 10.4** — Given `bun run scripts/profile/feedback.ts suggest`, when run, then actionable suggestions are produced with evidence links. Example output:

```json
{
  "suggestions": [
    {
      "action": "Add 'fintech' to domain skills",
      "evidence": "Cited in 3 rejections (app_20260701_leumi, app_20260705 Discount, app_20260710 Hapoalim)",
      "confidence": "high"
    }
  ]
}
```

**AC 10.5** — Given `--apply` flag on `feedback suggest`, when run, then suggestions are auto-applied to `data/profile.json` and a summary is printed.

## Out of scope

- OAuth flows for LinkedIn/GitHub (public APIs and manual input only)
- Real-time sync / file watchers
- Profile versioning / history
- Cover letter generation from profile (covered by existing pipeline)
- Resume parsing from PDF (only LaTeX .tex files)
