# How `/apply` Works

`/apply` is an adapter over the evidence-grounded application process; it is not permission to submit an application. The canonical, command-level procedure is [Evidence-Grounded Job Pilot](workflows/evidence-grounded-job-pilot.md).

## The current workflow

### 1. Preserve the source

Start with a job URL or the complete pasted posting. Save the employer source URL, observation date, update date when available, role, company, and location. If the source blocks extraction, ask for the complete job description instead of using a partial snippet.

### 2. Parse capability fit separately from eligibility

Run `summarize` and `score`. Report both outputs:

- **Capability score:** the 0–100 match, breakdown, evidence, gaps, and neutral inputs.
- **Eligibility:** `eligible`, `ineligible`, or `review`, based on explicitly stated work preferences, office days, and residence constraints.

A strong technical score is not a reason to ignore an employment constraint. Conversely, an eligibility constraint must not erase evidence of technical fit.

### 3. Select the role before drafting

The user selects from the traceable shortlist. The only default exception is a tightly scoped pilot with one explicitly eligible role; record why it was selected and why alternatives were not.

### 4. Prepare a constrained evidence contract

`application prepare` builds a provider-neutral prompt bundle from `data/profile.json`, selected job-relevant work case studies, job facts, market conventions, and the score/gaps. The profile is the source of truth—never an old CV, `CLAUDE.md`, lab work, or an adjacent skill.

### 5. Draft with evidence IDs and review

Every candidate claim references profile evidence. Job evidence establishes context only; it cannot prove candidate experience. Gaps remain gaps. `application review` rejects unsupported claims, numbers, and unselected project evidence.

### 6. Render the current Typst source

The renderer writes convention-named CV/cover-letter sources. The CV header receives literal email, phone, and location for ATS readability, compact clickable LinkedIn/Website labels when present in the profile, and raw language names without invented proficiency levels.

### 7. Mandatory quality gates

`bun run reevaluate --market <code>` always recompiles a Typst source before checking it; imported-template or design-system changes must never leave a stale PDF marked current. The gate checks:

1. the selected market's CV page budget (cover letter = 1);
2. 192-PPI raster layout safety: 10-mm edge band and text/rule collision checks;
3. page density: reject a technically safe but visibly underfilled final page;
4. ATS text extraction and reading order through Poppler;
5. filename convention.

Then inspect every final rendered page for clipping, overlap, raw markup, broken wrapping, and orphaned headings. When links are included, check the actual PDF URI annotations, not only the visible labels.

### 8. State the delivery boundary

If Poppler is missing, `--allow-missing-ats` can create a clearly labelled **non-shipping local pilot**. It does not pass ATS verification and must not be submitted. A tracker write or application submission still requires separate explicit human confirmation.

## Integrity guarantees

- No invented skills, years, scope, technologies, or outcomes.
- No keyword stuffing; exact posting terminology is used only where profile evidence supports it.
- Parser defects found in real postings receive narrow regression fixes before the result is trusted. Existing safeguards include GCP/Go, SWIFT/Swift, and language-benefit false positives.
- The final pilot report records sources, decision evidence, gaps, artifacts, gate status, and any blocker.
