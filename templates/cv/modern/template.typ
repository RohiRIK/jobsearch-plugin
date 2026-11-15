// ─── Typst Modern CV Template ──────────────────────────────────────────────
// Clean, single-column layout optimised for both human scanning and ATS text
// extraction. The public input shape is intentionally compatible with the
// original two-column template; skill `level` values are accepted but never
// visualised as subjective proficiency bars.

#import "../../design-system.typ": *

// ─── Clean skill label helper ──────────────────────────────────────────────

#let clean-skill-label(label) = {
  let colon-pos = label.position(": ")
  if colon-pos != none {
    label = label.slice(0, colon-pos)
  }
  label
}

// ─── Main Body ─────────────────────────────────────────────────────────────

#let cv-body(
  name: "",
  lastname: "",
  contact: (),
  languages: (),
  headline: "",
  photo: "",
  profile: "",
  skills: (),
  experience: (),
  projects: (),
  education: (),
  certifications: (),
  // Owner-confirmed interests, one line at the very end; never reordered.
  interests: (),
  education-first: false,
  // Explicit order from the application strategy: any of "summary", "experience",
  // "projects", "education", "certifications". Empty means the market default
  // (education-first). A section with content that the order leaves out is
  // appended in default order rather than dropped: evidence never disappears.
  section-order: (),
  is-rtl: false,
  layout: "modern",
) = {
  return (it) => {
    // One row per layout id in src/cv-options.ts. Every layout differs from the
    // others in at least one visible property; tests/cv-layouts.test.ts renders
    // them all and fails if two produce the same page (issue #4).
    let styles = (
      modern: (accent: accent, density: "balanced", marker: "•", name-size: size-name, profile-fill: true, heading: "rule"),
      ats-compact: (accent: accent, density: "compact", marker: "•", name-size: size-name, profile-fill: true, heading: "rule"),
      resume-compact: (accent: rgb("#0f766e"), density: "tight", marker: "•", name-size: 24pt, profile-fill: false, heading: "rule"),
      technical: (accent: rgb("#0f766e"), density: "compact", marker: "•", name-size: size-name, profile-fill: true, heading: "rule"),
      executive: (accent: rgb("#1f3a5f"), density: "balanced", marker: "–", name-size: 32pt, profile-fill: true, heading: "rule"),
      minimal: (accent: rgb("#475569"), density: "balanced", marker: "–", name-size: size-name, profile-fill: false, heading: "plain"),
      classic: (accent: rgb("#1f3a5f"), density: "balanced", marker: "•", name-size: size-name, profile-fill: false, heading: "caps"),
      swiss-grid: (accent: rgb("#111111"), density: "balanced", marker: "–", name-size: size-name, profile-fill: false, heading: "swiss"),
      project-first: (accent: accent, density: "balanced", marker: "•", name-size: size-name, profile-fill: true, heading: "rule"),
      creative: (accent: rgb("#7c3aed"), density: "roomy", marker: "•", name-size: size-name, profile-fill: true, heading: "rule"),
      modern-airy: (accent: accent, density: "balanced", marker: "•", name-size: 26pt, section-size: 11.5pt, entry-size: 10.5pt, body-size: 10.3pt, meta-size: 9.5pt, leading: 0.45em, gap-section: 10pt, gap-entry: 8pt, margin-x: 15mm, margin-y: 12.5mm, font: "Liberation Sans", profile-fill: true, heading: "airy"),
    )
    let style = styles.at(layout, default: styles.modern)
    let dense = style.density in ("compact", "tight")
    let tight = style.density == "tight"
    let style-accent = style.accent
    let bullet = style.marker
    // Local per-layout typography overrides (modern-airy). Every other layout
    // falls back to the shared design-system defaults, so existing variants
    // render exactly as before; nothing here changes shared defaults globally.
    let effective-meta = if layout == "modern-airy" { rgb("#56646f") } else { meta }
    let effective-font = style.at("font", default: body-font)
    let effective-name-size = style.at("name-size", default: size-name)
    let effective-section-size = style.at("section-size", default: size-section)
    let effective-entry-size = style.at("entry-size", default: size-entry)
    let effective-body-size = style.at("body-size", default: size-body)
    let effective-meta-size = style.at("meta-size", default: size-meta)
    let effective-leading = style.at("leading", default: leading-body)
    let effective-gap-section = style.at("gap-section", default: gap-section)
    let effective-gap-entry = style.at("gap-entry", default: gap-entry)
    let effective-margin-x = style.at("margin-x", default: margin-x)
    let effective-margin-y = style.at("margin-y", default: 1.6cm)
    let section = title => if style.heading == "rule" {
      section-title(title, fill: style-accent)
    } else if style.heading == "airy" {
      // modern-airy: title with an underline divider and a fixed 5pt
      // divider-to-content gap, kept with the following content.
      block(breakable: false, sticky: true, above: effective-gap-section, below: 0pt, {
        [#metadata(title) <cv-section>]
        stack(dir: ttb, spacing: 0pt,
          text(size: effective-section-size, weight: "bold", fill: style-accent)[#title],
          block(height: 3pt),
          rect(width: 100%, height: 0.4pt, fill: style-accent, stroke: none),
          block(height: 5pt),
        )
      })
    } else {
      // Same keep-with-next contract as section-title; only the look differs.
      block(breakable: false, sticky: true, above: effective-gap-section, below: 4pt, {
        [#metadata(title) <cv-section>]
        if style.heading == "swiss" {
          line(length: 100%, stroke: 1.4pt + style-accent)
          v(3pt)
          pad(bottom: 3pt, text(size: effective-meta-size, weight: "bold", tracking: 0.08em, fill: style-accent)[#upper(title)])
        } else if style.heading == "caps" {
          text(size: effective-section-size - 1pt, weight: "bold", tracking: 0.06em, fill: style-accent)[#upper(title)]
          v(2pt)
          line(length: 100%, stroke: 0.6pt + style-accent)
        } else {
          pad(bottom: 3pt, text(size: effective-section-size, weight: "bold", fill: style-accent)[#title])
        }
      })
    }
    set page(paper: "a4", margin: (x: if tight { 1.35cm } else if dense { 1.6cm } else { effective-margin-x }, y: if tight { 1.2cm } else if dense { 1.35cm } else { effective-margin-y }))
    set text(font: effective-font, size: if tight { 9pt } else if dense { 9.3pt } else { effective-body-size })

    if is-rtl {
      set text(dir: rtl, fill: body-color)
    } else {
      set text(fill: body-color)
    }

    set par(spacing: 5pt) if layout == "modern-airy" and sys.version >= version(0, 13, 0)
    show link: underline
    set par(leading: if dense { 0.45em } else if style.density == "roomy" { 0.65em } else { effective-leading }, justify: false)

    // Header: every contact value remains literal text in reading order. The
    // optional photo is decorative and market-gated by the renderer; it never
    // replaces literal contact text.
    let header-text = {
      text(font: effective-font, size: effective-name-size, weight: "bold", fill: style-accent)[#name]
      if lastname != "" [
        #h(7pt)
        #text(font: effective-font, size: effective-name-size, weight: "bold", fill: style-accent)[#lastname]
      ]
      if headline != "" [
        #v(3pt)
        #text(size: effective-meta-size, fill: effective-meta)[#headline]
      ]
      if contact.len() > 0 {
        v(5pt)
        text(size: effective-meta-size, fill: body-color)[
          #contact.join([#h(5pt)•#h(5pt)])
        ]
      }
      if languages.len() > 0 {
        v(2pt)
        text(size: effective-meta-size, fill: effective-meta)[
          #metadata(languages.join(", ")) <cv-languages>
          Languages: #languages.join([#h(4pt)•#h(4pt)])
        ]
      }
    }
    if photo != "" {
      grid(
        columns: (1fr, auto),
        gutter: 18pt,
        align(left, header-text),
        align(top + right, image(photo, height: if layout == "modern-airy" { 2.2cm } else { 2.8cm })),
      )
    } else {
      align(left, header-text)
    }

    // Each section's heading travels with its first item in one unbreakable
    // block, including on the older npm Typst fallback.
    let summary-section = {
      if profile != "" {
        block(breakable: false, above: effective-gap-section, {
          section("Profile")
          block(
            width: 100%,
            fill: if style.profile-fill { rgb("#f2f6f9") } else { none },
            inset: if style.profile-fill { (x: 9pt, y: if layout == "modern-airy" { 4pt } else { 7pt }) } else { (x: 0pt, y: 2pt) },
            radius: 2pt,
          )[
            #metadata(profile) <cv-profile>
            #text(size: effective-body-size, fill: body-color)[#profile]
          ]
        })
      }
      if skills.len() > 0 {
        let skill-row(skill) = {
          let skill-value = skill.at("value", default: clean-skill-label(skill.label))
          // Fixed shared width aligns all rows while preserving page-break and
          // heading-with-first-row behavior from the current template.
          grid(
            columns: (if layout == "modern-airy" { 3.65cm } else { 4.6cm }, 1fr),
            gutter: 8pt,
            block(width: 100%)[#text(size: effective-meta-size, weight: "bold", fill: effective-meta)[#skill.label]],
            block(width: 100%)[#text(size: effective-body-size, fill: body-color)[#skill-value]],
          )
          v(if layout == "modern-airy" { 3pt } else { 8pt })
        }
        block(breakable: false, above: effective-gap-section, { section("Skills"); skill-row(skills.at(0)) })
        for skill in skills.slice(1) { block(breakable: false, skill-row(skill)) }
      }
    }

    let render-entry(date, title, organization, location, content, lead) = {
      if layout != "modern-airy" {
        cv-entry(date: date, title: title, organization: organization, location: location, content: content, lead: lead, marker: bullet)
      } else {
        // modern-airy entry rendered with the variant's own effective sizes.
        block(breakable: false, above: if lead != none { effective-gap-section } else { 1.2em }, {
          if lead != none { lead }
          grid(
            columns: (1fr, auto),
            gutter: 8pt,
            [
              #text(weight: "bold", size: effective-entry-size)[#title]
              #if organization != "" [#h(4pt) #text(weight: "regular", size: effective-body-size)[at #organization]]
              #if location != "" [#linebreak() #text(size: effective-meta-size, fill: effective-meta)[#location]]
            ],
            align(right)[#text(size: effective-meta-size, fill: effective-meta)[#date]],
          )
          if content.len() > 0 {
            v(3pt)
            grid(
              columns: (8pt, 1fr),
              gutter: 2pt,
              text(size: effective-body-size)[#bullet],
              text(size: effective-body-size)[#content.at(0)],
            )
            v(1pt)
          }
        })
        for item in content.slice(calc.min(1, content.len())) {
          block(breakable: false, grid(
            columns: (8pt, 1fr),
            gutter: 2pt,
            text(size: effective-body-size)[#bullet],
            text(size: effective-body-size)[#item],
          ))
          v(1pt)
        }
        v(if layout == "modern-airy" { 3pt } else { effective-gap-entry })
      }
    }

    let experience-section = {
      for (i, entry) in experience.enumerate() {
        render-entry(
          entry.date,
          entry.title,
          entry.company,
          entry.location,
          entry.content,
          if i == 0 { section("Experience") } else { none },
        )
      }
    }

    let projects-section = {
      for (i, project) in projects.enumerate() {
        // Only the heading and title row are unbreakable, sticky to the
        // description. A whole project in one unbreakable block jumped to the
        // next page and left 15-19% of the previous page empty (owner E2E run).
        // The spacing reproduces that single block's to within a point
        // (tests/cv-layouts.test.ts compares them): tighter spacing made the
        // same content shorter and failed final-page density (jobsearch-plugin#15).
        block(breakable: false, sticky: true, above: if i == 0 { effective-gap-section } else if layout == "modern-airy" { 8pt } else { 1.2em }, below: if layout == "modern-airy" { 3pt } else { 1.2 * size-body + 2.6pt })[
          #if i == 0 { section("Projects") }
          #text(weight: "bold", size: effective-entry-size)[#project.title]
          #if project.url != "" [
            #h(5pt)
            #text(size: effective-meta-size, fill: accent)[#link(project.url)[Project link]]
          ]
        ]
        if project.description != "" {
          block(above: 0pt, below: if layout == "modern-airy" { 3pt } else { 1.2 * size-body + 2pt }, text(size: effective-body-size)[#project.description])
        }
        for highlight in project.highlights {
          block(breakable: false, above: 0pt, below: 1.2em + 1pt, grid(
            columns: (8pt, 1fr),
            gutter: 2pt,
            text(size: effective-body-size)[#bullet],
            text(size: effective-body-size)[#highlight],
          ))
        }
        v(if layout == "modern-airy" { 3pt } else { gap-entry })
      }
    }

    let education-section = {
      for (i, entry) in education.enumerate() {
        render-entry(
          entry.year,
          entry.degree,
          entry.institution,
          "",
          if entry.field != "" { ([#entry.field],) } else { () },
          if i == 0 { section("Education") } else { none },
        )
      }
    }

    let certifications-section = {
      for (i, cert) in certifications.enumerate() {
        block(breakable: false, above: if i == 0 { effective-gap-section } else if layout == "modern-airy" { 4pt } else { 1.2em }, {
          if i == 0 { section("Certifications") }
          grid(
            columns: (1fr, auto),
            gutter: 8pt,
            text(size: effective-body-size)[#cert.name],
            text(size: effective-meta-size, fill: effective-meta)[#cert.date],
          )
        })
        v(2pt)
      }
    }

    let sections = (
      summary: summary-section,
      experience: experience-section,
      projects: projects-section,
      education: education-section,
      certifications: certifications-section,
    )
    // Section order is a market convention (src/market-profiles.ts) unless the
    // application strategy names one; the renderer passes it in, the template
    // never guesses.
    // project-first moves projects directly under the summary, whatever order
    // the strategy chose for the rest.
    let default-order = if layout == "project-first" {
      ("summary", "projects", "experience", "education", "certifications")
    } else if education-first {
      ("summary", "education", "certifications", "experience", "projects")
    } else {
      ("summary", "experience", "projects", "education", "certifications")
    }
    let order = section-order.filter(name => name in sections)
    if layout == "project-first" and "projects" in order {
      order = order.filter(name => name != "projects")
      let at = if "summary" in order { order.position(name => name == "summary") + 1 } else { 0 }
      order.insert(at, "projects")
    }
    for name in default-order {
      if name not in order { order.push(name) }
    }
    for name in order { sections.at(name) }
    if interests.len() > 0 {
      block(breakable: false, above: effective-gap-section, {
        section("Interests")
        text(size: effective-body-size)[#interests.join(", ")]
      })
    }

    it
  }
}
