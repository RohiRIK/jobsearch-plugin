# Release

Ship a version so installed users receive it. Needs a source checkout. Claude Code keeps users on the installed `version` until it changes; Hermes and Pi installs pinned to a tag behave the same.

1. Clean tree: `git status` shows only the work being released.
2. Gates: `bun run gates` (includes `plugin:check`), plus `bun run plugin:sync-skills --check --from <skills checkout>` when the library is available.
3. Pick the version (semver: new command or skill → minor; fix → patch; changed exit code or envelope → major and bump `CONTRACT_VERSION`).
4. `bun run plugin:release --version <x.y.z> --dry-run` → show the manifest changes → user yes → `--yes`. It bumps all three manifests, turns the CHANGELOG's Unreleased heading into the version heading, and rebuilds `dist/`.
5. `bun run gates` again; `claude plugin validate ./job-search --strict` and `claude plugin validate .` when the `claude` CLI exists; `hermes plugins doctor ./job-search` when Hermes exists. Report hosts you could not validate as not verified.
6. Commit `chore(release): job-search <x.y.z>`. Tagging (`job-search--v<x.y.z>`) and pushing are separate approvals — ask for each.

Rollback: users reinstall the previous tag (`claude plugin install job-search@rohirik` after `git checkout job-search--v<old>` of the marketplace, or `pi install git:github.com/RohiRIK/jobsearch-plugin@job-search--v<old>`). Never force-push a release tag.
