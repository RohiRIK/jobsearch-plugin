# Health

Read-only. Changes nothing; reports what works and the next command for each gap.

1. `jobsearch status` — workspace path and how it was resolved, profile validity, tracker counts, follow-ups due, document tools (`typst`, `pdftotext`, `pdfinfo`, `canvas`), and `next` hints.
2. `jobsearch hosts-doctor` — which agent hosts are present and whether this plugin's skills and MCP server are registered in each.
3. In a checkout only (`workspace.resolvedFrom` is `checkout`):
   - `bun run plugin:check` — bundle freshness, manifest agreement.
   - `bun run plugin:sync-skills --check` — synced skills untouched.
   - `bun run gates` — typecheck, tests, personal-data scan.

Report one table: check · pass/fail · detail · fix. A missing `typst`, `pdftotext` or `canvas` means documents cannot pass the shipping gate — say so plainly; it is not a warning. Typst is fixed with `jobsearch tools-install --tool typst` (dry-run first, `--yes` after a user yes); Poppler and canvas need the system package manager or `bun install`.

| Symptom | Likely cause | Fix |
|---|---|---|
| `profile.exists: false` | New workspace | `init` skill |
| `resolvedFrom: "xdg"` but data is in an old checkout | Data never migrated | `Data` workflow → `data-migrate` |
| `bundle-fresh` fails | Code changed without a build | `bun run plugin:build` |
| A host shows `registered: false` | Never installed there | `Hosts` workflow |
| Exit 20 `unavailable` from `jobsearch` | Bun or a bundled file missing | Reinstall the plugin; `bun` must be on PATH |
