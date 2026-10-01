# Plugin evals

Behaviour checks for `claude plugin eval` (each run is a real model call on your plan — run on demand, not in hooks).

Evaluate the **installed** plugin so `jobsearch` resolves its workspace to the run's temporary HOME (seeded by `fixtures/seed.sh` with the example profile from `tests/fixtures`). Evaluating by path from inside this repo would resolve the workspace to the checkout's real `data/`.

```bash
claude plugin install job-search@rohirik
claude plugin eval job-search@rohirik --scaffold --trust-plugin \
  --allow-tools "Bash(*jobsearch*)" --runs 3 --report evals-report.html
```

Cases grade both the result (regex or a short `llm` rubric) and the path taken (`tool_used`): one `triage` call instead of chained `score`/`summarize`/`select-template`, one `rank` call, `prepare` without `render`, `status` for health, `data-where` for data questions, and no skill at all for an unrelated request. Compare the WITH and W/OUT columns and the COST column before and after a change; `results/` is gitignored.
