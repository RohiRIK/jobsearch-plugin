# Audit

Is the system cheap for agents to use? Measure, then propose cuts. Read-only.

1. **Usage.** Summarise `<workspace>/data/state/agent-calls.jsonl` (one line per `jobsearch` call: `command`, `exit`, `ms`, `bytes`):

   ```bash
   bun -e 'const rows=require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse);const by={};for(const r of rows){const b=by[r.command]??={calls:0,errors:0,bytes:0,ms:0};b.calls++;if(r.exit>=2)b.errors++;b.bytes+=r.bytes;b.ms+=r.ms}console.log(JSON.stringify(by,null,1))' <workspace>/data/state/agent-calls.jsonl
   ```

   Look for: commands with high error rates (bad docs or a bad contract), large average `bytes` (offer `--fields` in the skill), repeated sequences that a single command could replace.
2. **Idle context.** In a checkout: `claude plugin details job-search` → "Projected token cost — Always-on". Each skill description and named MCP tool is paid on every turn.
3. **Budgets.** `bun test tests/context-budget.test.ts` — the ceilings for model-visible entries, description bytes, MCP schema, triage output and bundle size.
4. **Behaviour (optional, costs plan usage — ask first).** `claude plugin eval ./job-search` runs the cases in `job-search/evals/` with and without the plugin and reports the score difference and cost.

Report findings as a short table (measure · now · budget · proposal). Turn accepted proposals into `docs/planning/BACKLOG.md` items rather than editing on the spot.
