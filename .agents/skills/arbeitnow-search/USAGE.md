---
name: arbeitnow-search
description: "Search Arbeitnow (EU/Germany jobs incl. visa-sponsorship listings) via its public paginated JSON API. Deterministic Tier-1 CLI: JSON stdout, exit 0/1. Personal use only; attribution per the source's terms."
---

# Arbeitnow Search

```bash
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -q "devops" --limit 10
```

Output: `{ meta: { count, source, attribution }, results: [{ title, company, location, url }] }`.
Registered in the pipeline as portal `arbeitnow` — included in `bun run pipeline:scrape` by default.
Keep request volume low; link back to the source when sharing results.
