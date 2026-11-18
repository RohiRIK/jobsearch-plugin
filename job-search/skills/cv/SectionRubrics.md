# CV section rubrics

What each CV section is for, what it must contain and what fails it. The
writer prompt carries the same rubrics, generated from
`src/section-rubrics.ts`; a test keeps this file and that module in step.
`jobsearch review` enforces the mechanical parts. The judgement parts (is the
summary a real value proposition, does a bullet show problem, action and
result) are yours to get right before review.

## The hard rule: never invent metrics

A number may appear only when the cited evidence contains that same number.
When the evidence has no number, state the **scope** (the tenants, platforms,
users or systems the evidence names; "every client tenant"; "end to end") or a
**concrete result** ("replaced manual GPO review with a scripted mapping").
Never write a placeholder such as `X%`, `N users`, `[metric]` or `TBD`, and
never invent a number to fill one. Review fails both: `UNSUPPORTED_NUMBER` and
`PLACEHOLDER_METRIC`.

## Draft from the evidence matrix

`jobsearch prepare` returns `brief.evidenceMatrix`. Each row is one posting
requirement in rank order (rank 1 matters most) with the profile lines that
prove it, strongest first:

| Strength | Evidence | May support |
|---|---|---|
| `direct-work` | a role's responsibility or achievement (or its header) | headline (top 3 ranks), summary, skills, experience |
| `work-project` | a work project | skills, projects |
| `personal-project` | a personal project | skills, projects |
| `credential` | a certification or degree | certifications |
| `skill-label-only` | only a saved skill label | nothing: the row's status is `label-only` |

A row with status `gap` has no profile evidence. Never claim it; disclose it
in the cover letter if it matters. A `label-only` row is not a gap, but a saved
skill label is not proof of use, so it stays out of skills, bullets, the
headline and the summary until the profile records the work behind it.

The plan's `evidencePriorities` list each line once, with every requirement
it proves, best-ranked first. Cite those lines, not the role header.

## Headline

**Purpose:** Name the candidate's role identity for this posting.

**Length:** at most 10 words

**Must contain:**
- The target role noun
- One or two differentiating domains from direct-work matrix rows

**Fails:**
- A pipe- or comma-separated keyword list
- More than three tool names
- The profile headline copied verbatim

## Summary

**Purpose:** A tailored value proposition: who the candidate is for this role, the proof, and what the team gets.

**Length:** 2-3 sentences, 40-65 words

**Must contain:**
- Role identity plus years or scope taken from evidence
- One concrete proof tied to the top-ranked requirement, citing a responsibility, achievement or project line from the evidence matrix, not a skill label
- Fit to the problem the posting states, or the candidate's differentiator

**Fails:**
- A list of more than four tool names
- A sentence that would fit any job
- A gap or a label-only requirement stated as a capability
- Citing only identity or skill-label evidence

## Skills

**Purpose:** Show the reader, in the posting's own language, that the candidate covers its requirements.

**Length:** 1-5 groups, at most 6 items each, at most 24 items

**Must contain:**
- Groups named after the posting's capability areas, not the profile's categories
- Items ordered by the requirement's posting rank
- Every item cites at least one experience, achievement or project evidence ID that proves it

**Fails:**
- An item whose only evidence is its own profile:skill label (self-citing)
- A gap or label-only requirement
- Generic soft skills

## Experience

**Purpose:** Prove the thesis with work the candidate actually did in that role.

**Length:** 3-6 bullets per role, at most 30 words each

**Must contain:**
- Problem or context, then the action (verb + object + method or stack), then the result or the scope
- The first bullet of the first role proves mustProve[0]
- One requirement per bullet, citing the responsibility, achievement or employer-linked project that proves it

**Fails:**
- A paraphrased responsibility with no result or scope
- More than four tool names in one bullet
- A bullet citing only the role header or skill labels
- An invented or placeholder number

## Projects

**Purpose:** Add proof that the work history cannot fully cover.

**Length:** 0-2 projects

**Must contain:**
- Problem, then what was built (approach), then the outcome or scope
- Personal/work status comes from the project's kind, never from prose

**Fails:**
- Disclosure notes in the copy ("unrelated to ...")
- A feature list with no problem
- A personal project placed under a role

## Review codes

| Code | Severity | Meaning |
|---|---|---|
| `PLACEHOLDER_METRIC` | error | A metric slot such as `X%`, `N users`, `[metric]`, `TBD` |
| `UNSUPPORTED_NUMBER` | error | A number that is not in the cited evidence (whole-number match) |
| `GAP_AS_CLAIM` | error | A gap stated as a capability |
| `BANNED_PHRASE` | error | A cliché from `src/banned-phrases.ts` |
| `SKILL_SELF_CITED` | error (v2), warning (v1) | A skill item whose only evidence is a `profile:skill` label |
| `SUMMARY_WITHOUT_PROOF` | error (v2) | The summary cites no responsibility, achievement or project |
| `BULLET_WITHOUT_WORK_EVIDENCE` | error (v2) | A bullet cites only the role header or skill labels |
| `SUMMARY_TOOL_LIST` | warning | More than four tool names in the summary |
| `HEADLINE_KEYWORD_LIST`, `HEADLINE_COPIED` | warning | A keyword-list headline, or the profile headline verbatim |
| `BULLET_LENGTH`, `BULLET_TOOL_LIST` | warning | Over 30 words, or more than four tool names |
| `DUPLICATE_PRIORITY` | warning | The same evidence ID listed twice in `strategy.evidencePriorities` |

Contract v2 (`"version": 2`) groups skills: `cv.skills` is
`[{ "group": "...", "items": [{ "text", "evidenceIds" }] }]`, 1-5 groups of
at most 6 items, and the renderer prints the draft's groups in the draft's
order. Version 1 drafts (a flat skill list) still review and render.
