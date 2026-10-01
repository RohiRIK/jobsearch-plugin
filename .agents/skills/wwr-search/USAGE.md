---
name: wwr-search
description: "Search We Work Remotely (large remote-only board) via its public RSS feed. Deterministic Tier-1 CLI: JSON stdout, exit 0/1. Personal use only; attribution per the source's terms."
---

# We Work Remotely Search

```bash
bun run .agents/skills/wwr-search/cli/src/cli.ts search -q "devops" --limit 10
```

Output: `{ meta: { count, source, attribution }, results: [{ title, company, location, url }] }`.
Registered in the pipeline as portal `wwr` — included in `bun run pipeline:scrape` by default.
Keep request volume low; link back to the source when sharing results.
