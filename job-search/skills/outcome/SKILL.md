---
name: outcome
description: Record what happened after applying and turn it into advice — log results, analyse response patterns by channel and template, surface skill gaps from rejections, and track follow-ups due. USE WHEN an application gets a reply or a rejection, when reviewing pipeline health, or when asked which channels or templates are working. NOT FOR drafting documents (load the cv skill) or finding roles (load the research skill).
allowed-tools: Read, Glob, Grep, Bash(jobsearch:*), Bash(bun run:*), AskUserQuestion
---

# Close the loop

## Agent-first rule

You are the operator. Never ask the user to run a command from this skill. Read
the tracker and outcomes, run the analysis, and present the findings yourself.
Ask for an explicit human yes before any tracker write, profile edit, or
`--apply` operation.

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

The repo records every application, so response patterns are answerable from
data rather than impression. This is the half people skip, and it is the half
that makes the next application better.

## Record an outcome

```bash
jobsearch run outcome list                       # find the application id
jobsearch run outcome set <app-id> --status rejected --reason "<what they said>" --response-days 12
```

Statuses: `applied`, `interviewing`, `offered`, `rejected`, `withdrawn`,
`no_response`. Record `no_response` explicitly once enough time has passed —
silence is data, and leaving it as `applied` quietly biases every channel
statistic toward looking better than it is.

Bulk import: `jobsearch run outcome bulk --from <csv-path>`.

## Analyse

```bash
jobsearch run reason analyze         # scan outcomes, compute summary stats
jobsearch run feedback gaps          # skill gaps that recur in rejections
jobsearch run feedback channels      # rank job boards by response rate
jobsearch run feedback templates     # rank CV templates by response rate
jobsearch run feedback suggest       # actionable suggestions
```

`jobsearch run feedback suggest --apply` writes suggestions into the profile.
**Show the user the suggestions and get an explicit yes before using `--apply`** —
it edits the file every generated document draws its claims from.

Log a specific observation:

```bash
jobsearch run reason log --type skill_gap --finding "<observation>" --confidence medium
```

Types: `channel_effectiveness`, `template_effectiveness`, `skill_gap`,
`sector_fit`, `cover_letter_style`, `timing`, `general`. `--confidence`
(`low`, `medium`, `high`) is required.

## Pipeline health

```bash
jobsearch run dashboard              # unified analytics
jobsearch followups       # applications due a follow-up
jobsearch run pipeline:weekly        # weekly report to <workspace>/data/reports/
```

## Rules

- **Small samples do not support confident claims.** Three applications through
  one board is not evidence that the board works. Say how many data points a
  ranking rests on; `reason analyze` reports counts, so quote them.
- **A rejection reason is the employer's words, not a verdict on the profile.**
  Record it verbatim. Do not translate "we went with someone more senior" into
  a skill gap that was never mentioned.
- **Tracker writes through MCP need `confirm: true` and a human yes first.**
  `add_application` and `update_application_status` are the only write tools;
  get the yes in conversation before calling either.
- **Never edit the profile silently.** `--apply` changes what future documents
  claim about the candidate; that is the user's decision every time.

## More in this skill (read when the step needs it)

| File | Read when |
|---|---|
| `Record.md` | Recording one application's result step by step (the former `/outcome`) |
| `ReasoningLog.md` | Recording outcomes and reasoning entries |
| `ProfileFeedback.md` | Turning outcome patterns into profile suggestions |
