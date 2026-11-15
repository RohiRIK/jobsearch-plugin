# Preserve an approved application

Use before revising an application or preparing its final upload package.

## Freeze the acceptance contract

Record the selected layout, approved wording, required sections, selected project
slugs, credentials, contact-link policy, portrait decision and delivery formats in
an ignored per-application revision record. Reuse existing decisions instead of
asking the owner to choose again on every revision.

Preserve all explicitly requested education, certifications and selected relevant
projects. Improve structural spacing and pagination before changing content. If
content truly cannot fit the requested budget, explain that conflict; do not
silently remove qualifications or propose dropping requested credentials.

## Keep facts separate from presentation

Keep the master profile intact. Prepare, review and render with the same reviewed
application-specific `--profile` input when presentation wording differs. Record
its digest and verify that source/profile edits did not overwrite richer master
facts. Use the profile builder's explicit replacement/backup workflow only when
regeneration was actually requested. A missing preference stays unknown; zero is
not a substitute for a missing office-day limit.

Control URLs through renderer options, not by deleting stored project links.
For a LinkedIn-only application without project links, pass `--links linkedin`
and `--project-links off` to `jobsearch render`. Check actual PDF URI annotations
for both CV and cover letter, including hidden destinations. Portfolio source
links are a separate policy and can remain clickable.

Write concrete project behaviour from fresh implementation evidence and confirmed
candidate contribution. A valid evidence ID does not prove deployment, metrics,
employer association or an outcome. Keep independent workflows as separate
projects; group them only when the owner confirms they form one project. Preserve
professional, personal and lab boundaries instead of flattening tools into a
keyword inventory.

## Reuse the approved layout

`modern-airy` is a selectable modern-family variant, not a global replacement:
Liberation Sans; name 26pt; section headings 11.5pt; entry titles 10.5pt; body
10.3pt; supporting text 9.5pt; leading 0.45em; section gap 10pt; divider clearance
5pt; subsequent project gap 8pt; side margins 15mm and vertical margins 12.5mm.
Keep any other owner-selected layout unless a change is approved. Larger leading
alone is not structural spacing and can push text into rules or another page.

## Deliver an uploadable portfolio

Use the self-contained `about` template for an icon-bearing editorial portfolio:

```bash
jobsearch portfolio --template about --format html --profile <reviewed-profile.json> --out <portfolio.html> --yes
jobsearch portfolio --template about --format pdf --profile <reviewed-profile.json> --out <portfolio.pdf> --yes
```

Read the target portal's accepted formats. A portal accepting PDF/DOC/DOCX/RTF
cannot accept HTML; deliver the actual PDF attachment, not another HTML file.
PDF export needs Chromium/Chrome and Poppler. It blocks document scripts and
remote resource loads, expands disclosure content, checks expected project,
skill and credential text, rejects blank pages and only then replaces the output.
Use embedded assets for portraits/fonts; remote assets are not loaded at print.
Restricted and unreviewed projects remain excluded. Derive expected items from
the selected input and disclosure decisions, not a hardcoded project/skill count.

Keep screen layout and print layout separate. Print uses ordinary block flow;
web flex/grid/sticky wrappers can clip content at page boundaries. Check every
final page for clipped lines, broken icons, orphan headings, sparse trailing pages
and collisions. A preservation receipt explicitly still requires visual review;
it is not the CV/cover-letter shipping gate and does not certify arbitrary overlap.

## Verify the exact final revision

Run the CV/cover machine gates, extract and compare requested text, inspect every
final raster and audit PDF URI annotations. Use a fresh output directory or derive
raster filenames from the actual current page count so stale pages do not enter
contact sheets. Record exact PDF digests, inputs, commands, page counts, inspected
rasters and remaining limitations. Exercise regeneration once and compare text,
links and geometry. Deliver CV, cover letter and portfolio as separate real files
with the original job link when requested; leave approved artifacts unchanged
while developing plugin improvements.
