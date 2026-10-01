---
description: Tailor a CV and cover letter for one posting through the evidence-grounded workflow
argument-hint: "<posting URL | text | file>"
---

# /apply - Evidence-Grounded Application Workflow

Use the shared application workflow for `$ARGUMENTS`, which may be a job-posting URL, pasted posting text, or a local posting file.

<workflow>
1. Load the `cv` skill (`${CLAUDE_PLUGIN_ROOT}/skills/cv/SKILL.md`, the canonical workflow). Its linked `${CLAUDE_PLUGIN_ROOT}/skills/cv/EvidenceGroundedPilot.md` maintains the source, eligibility and final QA procedure.
2. Follow the workflow end to end: evaluate fit, run `jobsearch prepare`, draft both documents with the current host LLM, run `jobsearch review` until it passes, then run `jobsearch render --yes` once the user has chosen a layout. For a second opinion on content, hand both drafts inline to the `reviewer` agent.
3. Compile and inspect both PDFs, then iterate on `jobsearch gate --company <company> --role <role>` until every required gate passes.
</workflow>

<safety>
Candidate claims come only from validated profile evidence. Preserve evidence references through revisions, keep genuine gaps visible, and verify external company claims before including them. Rendering or overwriting files happens only after review passes and the user's application intent is clear.
</safety>

<result>
Report the fit decision, key tailoring choices, honest gaps, review and reevaluation verdicts, and final CV/cover-letter paths.
</result>
