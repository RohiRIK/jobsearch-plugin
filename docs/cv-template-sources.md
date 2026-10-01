# Upstream CV template catalog

These are external Typst CV designs reviewed as **layout references**. They are
not copied into this repository and they are not activated automatically. An
adapter is required before any upstream design can consume an
`ApplicationDraft`.

| Source | License | Pinned commit | Avatar support | Intended use |
|---|---|---|---|---|
| [Brilliant CV](https://github.com/yunanwg/brilliant-cv) | Apache-2.0 | `09add080ccdfa3394ede61f54092e046402727cc` | Yes | Structured technology/senior CV |
| [modern-typst-resume](https://github.com/peterpf/modern-typst-resume) | Unlicense | `0f8f58d58ce335925e33a1ea683cf907d554fe24` | Yes | Visual two-column portfolio-style CV |
| [Typst-CV-Resume](https://github.com/jxpeng98/Typst-CV-Resume) | MIT | `b20eecddd299b18003dca943375ebda8cfe01e81` | Yes, multiple photo styles | Traditional/academic CV with photo variants |
| [Basic Typst Resume](https://github.com/stuxf/basic-typst-resume-template) | Unlicense | `e7b02372015a39de3f486f833cb29458e2aed6b8` | No | ATS baseline |
| [Bamboovir Typst Resume](https://github.com/bamboovir/typst-resume-template) | MIT | `bd2243b188e1969834cf5d94dc2abed4c69886e7` | No | Developer CV reference |

`ptsouchlos/modern-cv` was reviewed visually but is not in the adoption catalog
until its license is clarified.

## Integration contract

An upstream template becomes selectable only when all of the following exist:

1. A pinned source revision and recorded license.
2. An adapter from the shared `ApplicationDraft` contract.
3. Literal ATS contact text and no icon-only contact data.
4. Evidence references preserved for every candidate claim.
5. A compiled preview generated from the same draft as the local templates.
6. ATS, edge-safety, rule-collision, and page-density gates.
7. A test proving avatar insertion follows the template's own slot.

The current `modern` implementation remains the only production default until
an upstream adapter passes that contract. The user still chooses the final
layout after the agent presents the ranked options.
