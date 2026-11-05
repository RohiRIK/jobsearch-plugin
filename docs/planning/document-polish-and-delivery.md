# Document polish and delivery

## Goal
Make the real CV/cover-letter refinement loop reproducible through the plugin rather than hand-editing generated Typst files.

## Observed failures
- Skill columns aligned per row rather than per table; clearance was not tested. Already repaired with rendered PDF geometry regressions.
- Machine-formatted dates leaked into candidate documents.
- An approved portrait outside the plugin was not discovered; an absolute host path was invalid inside the Typst compile root.
- A website URL was omitted from the profile-driven cover letter; URI presence was mistaken for a live destination check.
- Internal annotations and vague production qualifiers appeared in recruiter-facing copy.
- Body words were misread as section headings by ATS checks.
- Host-only Markdown paths were delivered instead of chat attachments.

## Implementation sequence
1. RED/GREEN tests for human-readable dates preserving original precision, unknown values and input data.
2. RED/GREEN tests for a portable local portrait path and clickable, underlined identity links in both document types.
3. Clean only redundant standalone `(production)` display qualifiers; preserve lab/not-production restrictions, acronym expansions and credential identifiers. Do not rewrite facts.
4. RED/GREEN regression for real section headings instead of substring matches.
5. Package workflow guidance for owner-only fact interviews, approved asset intake, live destination checks, literal-contact and PDF annotation checks, geometry plus visual QA, and native attachment delivery. Keep visual status separate from mechanical gate status.
6. Build package, run typecheck/full suite/plugin check/personal-data scan. Recreate the real pair via renderer, gate exact paths, inspect final pages and links.

## Boundaries
No automatic profile-fact changes, photo scraping, external submission, tracker records, infrastructure changes or publication. Reuse owner-approved portrait and layout. Do not silently infer production use from homelab work. Keep personal dogfood inputs and outputs ignored; synthetic regression fixtures only in version control.

## Acceptance
- Existing precision retained: `YYYY-MM` -> `Mon YYYY`, `YYYY` remains a year, unknown dates unchanged.
- CV and supported cover templates retain profile LinkedIn and website PDF annotations; URLs remain profile-owned, not hardcoded or automatically repaired.
- Portrait compiles across separate workspace and code roots without host-path duplication.
- ATS ignores heading words inside normal prose while rejecting actual interleaved headings.
- Re-rendering reproduces polished output without manual source-only modifications.
- Unit/integration tests and real PDF QA support completion claims. No machine-green claim is described as proof of every visual property.

## Verification receipt — original author branch

The counts below describe the original renovation branch, not the publication
candidate rebased onto newer upstream releases.

- Base: `0bb0884`. Replayed the new polish/ATS tests in an isolated clean-base export: six expected failures (dates, portrait compilation, website propagation, badge display and heading prose).
- Added a negative regression preserving production labels when later text qualifies or limits their scope. It failed before the narrow trailing-badge fix and passed afterwards.
- Full suite: **844 pass, 0 fail** across 58 test files; TypeScript, package build/check and tracked personal-data scan passed.
- Real CV and cover letter were prepared, reviewed, rendered and gated using an ignored application-specific profile/draft. Repeated rendering preserved extracted text and URI annotations without generated-source patches; the master profile remained unchanged.
- Both final pages were rasterized and visually inspected. URI presence and live destination checks are separate evidence, as are a mechanical gate and a human visual pass.
- Max independently reviewed the source/tests read-only: READY, zero blocking findings. No publication, live profile edits, applications or tracker writes.

## Publication reconciliation

Port only the document corrections onto current upstream release 2.4.3, not the
unrelated renovation ancestry. Preserve current main's selectable links,
interests, strategy-driven section ordering, ten distinct layouts, educational
field deduplication, project spacing and heading/orphan protections. The ATS
heading helper is already present upstream and must not be replaced with an
older implementation. The skill-row fix shares a fixed column width across rows
while retaining current main's per-row page-break handling.

The public repository is a generated mirror. Land the same non-personal source
change upstream as well, so its scheduled synchronization does not revert the
public fix. Keep source ownership/repository metadata unchanged in each repo.
The added PDF regression tests use the existing Typst resolver; CI installs
Poppler so geometry and URI checks are actually exercised rather than skipped.

Publication candidate checks: 544 passing tests in the public snapshot, 549 in
the private source (which additionally tests snapshot sanitization). Typecheck,
package freshness and privacy scans are separate gates. These counts are not
the original author-branch's 844 tests; no unrelated matching/storage features
are being published by this correction.

## What remains human work

The package cannot establish a candidate's actual contribution, guarantee that a
website will remain reachable, or prove every visual property from a green gate.
The shared workflow now makes these explicit steps rather than implied claims.
It also requires native PDF attachments, because a raster preview has no active
links and a host-only Markdown path is not a delivered download.
