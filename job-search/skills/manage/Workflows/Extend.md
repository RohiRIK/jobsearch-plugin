# Extend

Add to the system. Needs a source checkout; confirm with `jobsearch status` (`workspace.resolvedFrom: "checkout"`) or by finding `package.json` with `"name": "ai-job-search"`. Run `git status` first and keep unrelated changes out of your diff.

| Adding | Use | Then |
|---|---|---|
| A `jobsearch` command | `../create-cli-agent` (AddCommand) with `../PluginConventions.md` § Adding a command | contract tests → `bun run plugin:build` |
| A skill | `../create-skill` (CreateSkill workflow) with `../PluginConventions.md` § Adding a skill | plugin test skill list, README row |
| A job portal | the `add-portal` command | register in `PORTALS` (`scripts/pipeline/cli.ts`); a portal with npm dependencies stays checkout-only (`CHECKOUT_ONLY_PORTALS` in `scripts/plugin/build.ts`) |
| A CV / cover template | the `add-template` command | `meta.json` filled in, or the template engine reports a stub |
| A new agent host | `../create-plugin` | a row in `docs/planning/host-contracts.md` citing the host's own docs first, then the adapter and its `hosts-install` case |

Finish every extension with:

1. `bunx tsc --noEmit`
2. `bun test tests/`
3. `bun run plugin:build` (code or templates changed) and `bun run plugin:check`
4. `bun run scan-personal-data`

All four green before a commit (Conventional Commits). Do not bump the version here — that is Release.
