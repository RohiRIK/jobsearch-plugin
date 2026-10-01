---
name: manage
description: Operate and extend the job-search system — health checks, host installs, data backup and migration, efficiency audits, new commands or skills, releases. USE WHEN checking the install, installing on a host, moving data, adding a feature or shipping. NOT FOR applications (cv), role search (research) or outcomes.
allowed-tools: Read, Glob, Grep, Edit, Write, Bash(jobsearch:*), Bash(bun run:*), Bash(bun test:*), Bash(bunx tsc:*), Bash(git status:*), Bash(git diff:*), AskUserQuestion
category: workflow
effort: medium
domain: ops
---

# Manage the job-search system

You are the operator. Never ask the user to run a command from this skill; run it, read the JSON, report. Ask only before a write the workflow marks as approval-gated. Commands and placeholders (`jobsearch`, `<workspace>`) work as in `../init/SKILL.md` § Running the tools; `jobsearch --help-json` is the authority on flags.

## Workflow Routing

| Workflow | Trigger | File | Needs checkout |
|---|---|---|---|
| **Health** | "is it working", after install or upgrade | `Workflows/Health.md` | no |
| **Hosts** | "install on Hermes/Pi/OpenCode/OpenClaw", "uninstall", "roll back" | `Workflows/Hosts.md` | no |
| **Data** | "where is my data", "back up", "move my data", "reset" | `Workflows/Data.md` | no |
| **Audit** | "is it efficient", "what do agents actually use", "why is it slow" | `Workflows/Audit.md` | no |
| **Extend** | "add a command / skill / portal / template / host" | `Workflows/Extend.md` | yes |
| **Release** | "ship it", "cut 1.2.0", "publish the plugin" | `Workflows/Release.md` | yes |

A checkout is a clone of the repo (`jobsearch status` → `workspace.resolvedFrom: "checkout"`, or `bun run gates` exists). Without one, say which workflow needs it and stop.

## Quick Reference

- Read-only first: `jobsearch status`, then `jobsearch hosts-doctor`. Report a pass/fail table before changing anything.
- Every write: `--dry-run`, show the user the exact changes, get a yes, then `--yes`. Exit 10 = preview, 5 = conflict (never force past it).
- Conventions for anything you add: `PluginConventions.md` (where this plugin overrides the skill library).
- The skill factory ships with the plugin: `../create-skill`, `../create-cli-agent`, `../create-plugin`.

## Gotchas

- `dist/` is committed and installs never build: change code → `bun run plugin:build`, or `plugin:check` (and the pre-push gate) fails as stale.
- Claude Code pins installs to `version`: a pushed change without `plugin:release` never reaches users.
- Personal data never goes in `${CLAUDE_PLUGIN_DATA}` or the plugin dir: Claude Code deletes those on uninstall. It lives in `<workspace>`.
- `gate` reporting `unavailable` (no typst, pdftotext or canvas) is a failure, never a pass.
- Plugin commands are namespaced: `/apply` is `/job-search:apply` once installed.
- Synced skills (`create-*`) are generated: edit RohiRIK/skills and re-sync; a hand edit fails `plugin:sync-skills --check`.

## Examples

**Example 1:** "Is my job-search setup working?" → Health → `jobsearch status` + `jobsearch hosts-doctor` → table of what passes, what is missing, and the next command for each gap.

**Example 2:** "Add a command that lists follow-ups due this week" → Extend → create-cli-agent AddCommand contract on `src/jobsearch/commands.ts` → contract tests → `plugin:build` → gates.

**Example 3:** "Install this on Hermes for my work profile" → Hosts → `jobsearch hosts-install --host hermes --scope profile:work --dry-run` → show changes → user yes → `--yes` → `hosts-doctor`.
