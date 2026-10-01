# Claude Code

Install the plugin from this repository's marketplace (user scope):

```bash
claude plugin marketplace add RohiRIK/jobsearch-plugin
claude plugin install job-search@rohirik
```

or let the CLI do it after a preview: `job-search/scripts/jobsearch hosts-install --host claude --dry-run`.
Inside this repository the plugin is already declared in `.claude/settings.json`; Claude Code offers to install it when you trust the folder. For live edits while developing, start with `claude --plugin-dir ./job-search`.
