> Context file of the `research` skill — `jobsearch`, `<workspace>` and `<assistant>` are defined in its SKILL.md.

# Market conventions

CV conventions differ by country in ways that change the document, not just its
wording. Switzerland and Ireland sit in the same market bloc: one expects a
photo, a work-permit line and an *Arbeitszeugnis*; the other treats a photo as
grounds for rejection under employment-equality rules. Applying a single
"European CV" to both produces one good application and one bad one.

## Do not answer from memory

The conventions live in `src/market-profiles.ts` and are surfaced by a CLI.
Read them rather than recalling them — they carry sources, and they change.

```bash
jobsearch run markets table              # all markets at a glance
jobsearch run markets show de            # full conventions + sources for one market
jobsearch run markets detect --job job.txt   # what a posting targets
```

## How it reaches the documents

`detectMarket()` feeds two consumers from one definition:

1. **Template scoring** — `scripts/match/template-engine.ts` ranks templates on
   the detected market. Templates declaring the coarse region (`markets: ["eu"]`)
   still match every European country, so nothing silently demotes.
2. **The drafting prompt** — `buildApplicationBrief()` injects
   `conventionsBlock()` into the bundle the LLM drafts against, and defaults the
   document language to the market's own.

This is why the conventions are data and not prose in this file: a skill only
reaches the second consumer. Encoding them here would leave the template engine
scoring on one set of assumptions while the model drafted against another.

## Using it in an application

Detection runs automatically from the posting. Override it when the posting is
ambiguous or you know better:

```bash
jobsearch prepare --company Zalando --role "Cloud Security Engineer" \
  --job <workspace>/data/jd/zalando.txt --market de
```

`--language` still wins over the market default when you pass it.

## Rules

- **The posting overrides the profile.** A Berlin posting written in English
  asking for no photo beats the German default. Conventions are priors.
- **Never invent a convention for a market that has no profile.** An
  unrecognised posting falls back to the conservative international default —
  no photo, contact details only, two pages. Add a profile instead of guessing.
- **Do not let a convention manufacture content.** "Germany expects education
  detail" is not licence to invent qualifications. The evidence rules in the
  application pipeline still bind.
- **Check the sources before trusting an old claim.** Each profile lists where
  its guidance came from; the cross-country table dates from 2022 and national
  practice moves, particularly on photos.

## Known conflicts

Denmark is the clearest: the official Workindenmark guidance invites a short
personal section (age, family, interests) because employers weigh whether you
will settle, while GDPR-minded guides say keep personal data out. The profile
notes both and keeps the section short and optional. When sources genuinely
conflict, say so rather than picking one silently.
