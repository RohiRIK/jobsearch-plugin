---
name: init
description: Set up this job-search workspace and prove it works — toolchain check, candidate profile, and the guards that stop personal data reaching git. USE WHEN starting on a fresh clone, after `bun install`, when tools report NO_PROFILE or NO_DATA, or when asked to onboard/initialise the workspace. NOT FOR drafting documents (load the cv skill) or finding roles (load the research skill).
allowed-tools: Read, Glob, Grep, Bash(jobsearch:*), Bash(bun run:*), Bash(bash .agents/*), AskUserQuestion
---

# Initialise the workspace

## Agent-first rule

You are the operator. Never ask the user to run a command from this skill. Run
the commands yourself, read their output, and report what happened. Ask the
user only for personal facts that are missing from their documents, or for an
explicit approval before a write. Present a short summary when finished.

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

Four steps, in order. Each has a command that tells you whether it worked — run
it and read the output rather than assuming the step succeeded.

## 1. Toolchain

```bash
jobsearch status            # workspace, profile, tracker, document toolchain, next steps
jobsearch run doctor        # every external binary, what it unlocks, install hints
```

In a source checkout run `bun install` first. Only `bun` is required; the rest
degrade specific features (`status.tools` shows each, including the `canvas`
raster check):

| Missing | What stops working |
|:--------|:-------------------|
| `typst` | Typst CV/cover compilation. Missing: `jobsearch tools-install --tool typst --dry-run`, then `--yes` after the user agrees (installs a pinned 0.12+ release into the workspace; the npm/bunx fallback is 0.10) |
| `pdftotext` / `pdfinfo` | The ATS text-layer gate — documents cannot be verified |
| `lualatex` / `xelatex` | The LaTeX path only; Typst is the default |

Install what is missing before continuing. A document that cannot be verified
must not be sent.

## 2. Candidate profile

Everything downstream reads `<workspace>/data/profile.json`. The shipped
`data/profile.json.example` is a schema-valid placeholder containing no real
contact data. Create the real, gitignored file first:

```bash
jobsearch run profile:scaffold
```

`profile:scaffold` refuses to overwrite an existing profile unless `--force` is
explicitly requested. The agent must not use `--force` without the user's
explicit approval. Replace every placeholder with verified facts, then run
`jobsearch run profile:check` to validate the shape before continuing.

Interactive, when the user is present:

```
/setup
```

Non-interactive, when sources are already configured:

```bash
bun run profile          # fetch configured sources and merge into the profile
bun run profile:github   # individual fetchers, if you need one in isolation
bun run profile:cv
```

Confirm it landed before moving on — `jobsearch run dashboard` should stop reporting
`NO_PROFILE`. After the user approves projects with `jobsearch run projects approve
<slug>`, generate the project warehouse with `bun run portfolio`. The agent runs
both; the user only decides which projects may be published.

## 3. Guards

```bash
bun run hooks:install
```

Enables `.githooks/pre-commit` (blocks a commit containing personal contact
details) and `.githooks/pre-push` (runs typecheck, tests and the personal-data
scan over tracked files *and* full history).

**Say this to the user plainly:** GitHub Actions on this repo has been refusing
to start since 2026-07-18 on a billing failure — the repo is private, so Actions
bills against a minutes allowance. The workflows are correct and will run once
that is resolved, but until then **the local hooks are the only layer that
actually executes**. Someone committing with `--no-verify`, or from a clone
where `hooks:install` was never run, has no safety net.

## 4. Prove it

```bash
bun run gates
```

Typecheck, the full test suite, and the personal-data scan in both modes. Green
means the workspace is genuinely ready. If it is not green, fix that before
doing any work — a red baseline makes every later failure ambiguous.

## Rules

- **Never invent profile data to get past a `NO_PROFILE`.** An empty profile is
  a signal to run step 2, not to fill in plausible-looking skills. Every claim
  in a generated document traces back to this file.
- **Never `git add -f` anything the ignore rules exclude.** `<workspace>/data/profile.json`,
  `<workspace>/data/jd/`, `<workspace>/data/scratch/`, the tracker DB and everything under
  `<workspace>/assets/applications/` are excluded deliberately.
- If `bun run gates` fails on the personal-data scan, read the finding rather
  than widening the pattern. Placeholders belong in `ALLOWED` in
  `scripts/scan-personal-data.ts`; real values belong in `<workspace>/data/profile.json`.

## More in this skill (read when the step needs it)

| File | Read when |
|---|---|
| `ProfileFetcher.md` | Building or refreshing the profile from GitHub, blog, LinkedIn or a CV (checkout-only pipeline) |
