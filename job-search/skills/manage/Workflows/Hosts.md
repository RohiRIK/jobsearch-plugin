# Hosts

Install, check, uninstall or roll back the plugin on an agent host. Every install writes user-level configuration, so it is approval-gated.

| Intent | Command |
|---|---|
| Which hosts exist here, what is registered | `jobsearch hosts-list` / `jobsearch hosts-doctor` |
| Preview an install | `jobsearch hosts-install --host <claude\|hermes\|opencode\|openclaw\|pi\|mcp> [--scope user\|project\|profile:<name>] --dry-run` |
| Install | same, with `--yes` instead of `--dry-run` |
| Uninstall / roll back | `jobsearch hosts-uninstall --host <host> --dry-run`, then `--yes` |
| Generic MCP host (Codex, Gemini, …) | `jobsearch hosts-install --host mcp --dry-run` prints the stdio entry to paste |

Steps:

1. `jobsearch hosts-doctor`; pick the host the user named.
2. Run the install with `--dry-run`. Show the user every file it would create or change (`data.changes`).
3. Ask for a yes. A Hermes profile scope (`profile:<name>`) is the user's choice; never guess one.
4. Run with `--yes`, then `jobsearch hosts-doctor` again and report the host's row.

Exit 5 means an unrelated skill or MCP entry already uses one of our names. Report it and stop; never delete or overwrite something the installer did not create.

Claude Code installs through its own plugin manager instead (the installer prints these when `--host claude`):

```bash
claude plugin marketplace add RohiRIK/jobsearch-plugin
claude plugin install job-search@rohirik
```
