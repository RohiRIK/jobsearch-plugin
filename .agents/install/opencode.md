# OpenCode

In this repository OpenCode reads `.agents/skills/job-search-assistant` (the router) and the `job-search` MCP server from `opencode.json`. For a user-level install that works in any directory:

```bash
job-search/scripts/jobsearch hosts-install --host opencode --dry-run   # preview
job-search/scripts/jobsearch hosts-install --host opencode --yes
```

It links the plugin skills into `~/.config/opencode/skills/`, adds `mcp.job-search` to `~/.config/opencode/opencode.json`, and puts `jobsearch` on PATH (`~/.local/bin`). It refuses (exit 5) if a skill or MCP entry with the same name already exists and is not its own.
