---
name: remotive-search
description: "Search Remotive (curated remote jobs) via its public API with server-side search. Deterministic Tier-1 CLI: JSON stdout, exit 0/1. Personal use only; attribution per the source's terms."
---

# Remotive Search

```bash
bun run .agents/skills/remotive-search/cli/src/cli.ts search -q "devops" --limit 10
```

Output: `{ meta: { count, source, attribution }, results: [{ title, company, location, url }] }`.
Registered in the pipeline as portal `remotive` — included in `bun run pipeline:scrape` by default.
Keep request volume low; link back to the source when sharing results.
