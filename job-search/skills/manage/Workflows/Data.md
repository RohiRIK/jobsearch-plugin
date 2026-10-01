# Data

Personal data lives in `<workspace>` (`jobsearch data-where`), never in the plugin. Resolution order: `JOB_SEARCH_HOME` → the checkout when run from one → `~/.local/share/job-search`. In Claude Code the plugin's "Job-search data folder" setting sets `JOB_SEARCH_HOME` for the MCP server.

| Intent | Command | Writes |
|---|---|---|
| Where is it, what exists | `jobsearch data-where` | no |
| Back up | `jobsearch data-backup --dry-run`, then `--yes` | a new `.tar.gz` only |
| Move from an old checkout | `jobsearch data-migrate --from <old checkout> --dry-run`, then `--yes` | copies; never deletes or overwrites |
| Reset the profile | the `reset` command (`/job-search:reset`) — destructive; back up first | yes |

Rules:

- Back up before any reset or migration onto a non-empty workspace.
- `data-migrate` exits 5 when the target already has an item: report the conflicting items; do not delete them to make room.
- After migrating, tell the user to set `JOB_SEARCH_HOME` (or the plugin's data-folder setting) if the target is not the default, then run `jobsearch status` to confirm.
- Never commit anything under `<workspace>`; in a checkout `bun run scan-personal-data` must stay clean.
