// ─── Design System ───────────────────────────────────────────────────────────
// Shared tokens for all Typst templates.
// Shared, ATS-friendly defaults. The font list deliberately ends in common
// Linux fallbacks so a cold machine does not silently render the templates in
// a serif face when Inter is unavailable.

#let accent = rgb("#1a5276")
#let accent-light = rgb("#2980b9")
#let meta = rgb("#7f8c8d")
#let body-color = rgb("#2c3e50")
#let pill-bg = rgb("#eaf2f8")
#let heading-font = ("Inter", "Arial", "Liberation Sans", "DejaVu Sans")
#let body-font = heading-font
#let size-name = 28pt
#let size-section = 12pt
#let size-entry = 10.5pt
#let size-body = 10pt
#let size-meta = 9pt

#let margin-x = 2.0cm
#let margin-y = 2.0cm
#let gap-section = 16pt
#let gap-entry = 10pt
#let leading-body = 0.55em
#let indent-bullet = 12pt

#let section-title(title, fill: accent) = {
  // sticky keeps the heading attached to whatever follows. Without it a section
  // title lands at the foot of a page with its first entry overleaf, which is
  // the orphan the verification checklist forbids and the page-count gate
  // cannot see. Requires Typst 0.12+.
  //
  // Spacing goes through above/below rather than bare v() calls: a v() between
  // the heading and the next block counts as intervening content and cancels
  // the stickiness.
  block(breakable: false, sticky: true, above: gap-section, below: 4pt, {
    text(size: size-section, weight: "bold", fill: fill)[#title]
    v(2pt)
    line(length: 100%, stroke: 0.4pt + fill)
  })
}

#let cv-entry(
  date: "",
  title: "",
  organization: "",
  location: "",
  content: (),
  // Content placed in the same unbreakable block as the title row, normally the
  // section heading for a section's first entry. `sticky` on section-title only
  // works on Typst 0.12+; this keeps the heading with its entry on any version.
  lead: none,
  marker: "•",
) = {
  let bullet-row(item) = {
    [#metadata(item) <cv-entry-item>]
    grid(
      columns: (8pt, 1fr),
      gutter: 2pt,
      text(size: size-body)[#marker],
      text(size: size-body)[#item],
    )
    v(1pt)
  }
  // The title row travels with its first bullet, so a role is never announced
  // at the foot of a page with all of its evidence overleaf. Later bullets may
  // still cross a page boundary: a fully unbreakable role leaves large gaps.
  // A block's spacing collapses into its parent's, so the heading's own `above`
  // is lost once it sits inside this block; restate it here.
  block(breakable: false, above: if lead != none { gap-section } else { 1.2em }, {
    if lead != none { lead }
    grid(
      columns: (1fr, auto),
      gutter: 8pt,
      [
        #text(weight: "bold", size: size-entry)[#title]
        #if organization != "" [
          #h(4pt)
          #text(weight: "regular", size: size-body)[at #organization]
        ]
        #if location != "" [
          #linebreak()
          #text(size: size-meta, fill: meta)[#location]
        ]
      ],
      align(right)[
        #text(size: size-meta, fill: meta)[#date]
      ],
    )
    if content.len() > 0 {
      v(3pt)
      bullet-row(content.at(0))
    }
  })
  for item in content.slice(calc.min(1, content.len())) {
    block(breakable: false, bullet-row(item))
  }
  v(gap-entry)
}

#let item-pill(label) = {
  box(
    inset: (x: 6pt, y: 3pt),
    radius: 3pt,
    fill: pill-bg,
  )[#text(size: size-meta)[#label]]
  h(3pt)
}

#let contact-sep = text(fill: meta)[#h(6pt)|#h(6pt)]
