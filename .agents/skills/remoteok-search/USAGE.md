---
name: remoteok-search
description: "Search Remote OK (remote/US tech jobs) via its public JSON API. Deterministic Tier-1 CLI: JSON stdout, exit 0/1. Personal use only; attribution per the source's terms."
---

# Remote OK Search

```bash
bun run .agents/skills/remoteok-search/cli/src/cli.ts search -q "devops" --limit 10
```

Output: `{ meta: { count, source, attribution }, results: [{ title, company, location, url }] }`.
Registered in the pipeline as portal `remoteok` — included in `bun run pipeline:scrape` by default.
Keep request volume low; link back to the source when sharing results.
