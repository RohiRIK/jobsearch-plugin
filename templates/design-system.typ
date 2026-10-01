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
) = {
  // Keep the identifying row together, but let a long bullet list cross a
  // page boundary. Keeping the whole role unbreakable can create large gaps
  // or overflow for senior candidates.
  block(breakable: false, {
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
  })
  if content.len() > 0 {
    pad(top: 3pt)[
      #for item in content {
        block(breakable: false)[
          #metadata(item) <cv-entry-item>
          #grid(
            columns: (8pt, 1fr),
            gutter: 2pt,
            text(size: size-body)[•],
            text(size: size-body)[#item],
          )
        ]
        v(1pt)
      }
    ]
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
