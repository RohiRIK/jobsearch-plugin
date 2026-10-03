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
    )
    let style = styles.at(layout, default: styles.modern)
    let dense = style.density in ("compact", "tight")
    let tight = style.density == "tight"
    let style-accent = style.accent
    let bullet = style.marker
    let section = title => if style.heading == "rule" {
      section-title(title, fill: style-accent)
    } else {
      // Same keep-with-next contract as section-title; only the look differs.
      block(breakable: false, sticky: true, above: gap-section, below: 4pt, {
        [#metadata(title) <cv-section>]
        if style.heading == "swiss" {
          line(length: 100%, stroke: 1.4pt + style-accent)
          v(3pt)
          pad(bottom: 3pt, text(size: size-meta, weight: "bold", tracking: 0.08em, fill: style-accent)[#upper(title)])
        } else if style.heading == "caps" {
          text(size: size-section - 1pt, weight: "bold", tracking: 0.06em, fill: style-accent)[#upper(title)]
          v(2pt)
          line(length: 100%, stroke: 0.6pt + style-accent)
        } else {
          pad(bottom: 3pt, text(size: size-section, weight: "bold", fill: style-accent)[#title])
        }
      })
    }
    set page(paper: "a4", margin: (x: if tight { 1.35cm } else if dense { 1.6cm } else { margin-x }, y: if tight { 1.2cm } else if dense { 1.35cm } else { 1.6cm }))
    set text(font: body-font, size: if tight { 9pt } else if dense { 9.3pt } else { size-body })

    if is-rtl {
      set text(dir: rtl, fill: body-color)
    } else {
      set text(fill: body-color)
    }

    set par(leading: if dense { 0.45em } else if style.density == "roomy" { 0.65em } else { leading-body }, justify: false)

    // Header: every contact value remains literal text in reading order. The
    // optional photo is decorative and market-gated by the renderer; it never
    // replaces literal contact text.
    let header-text = {
      text(font: heading-font, size: style.name-size, weight: "bold", fill: style-accent)[#name]
      if lastname != "" [
        #h(7pt)
        #text(font: heading-font, size: style.name-size, weight: "bold", fill: style-accent)[#lastname]
      ]
      if headline != "" [
        #v(3pt)
        #text(size: size-meta, fill: meta)[#headline]
      ]
      if contact.len() > 0 {
        v(5pt)
        text(size: size-meta, fill: body-color)[
          #contact.join([#h(5pt)•#h(5pt)])
        ]
      }
      if languages.len() > 0 {
        v(2pt)
        text(size: size-meta, fill: meta)[
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
        align(top + right, image(photo, height: 2.8cm)),
      )
    } else {
      align(left, header-text)
    }

    // Each section's heading travels with its first item in one unbreakable
    // block. section-title's `sticky` does the same on Typst 0.12+, but the npm
    // `typst` fallback is 0.10, which ignores it and orphaned headings (pilot).
    let summary-section = {
      if profile != "" {
        block(breakable: false, above: gap-section, {
          section("Profile")
          block(
            width: 100%,
            fill: if style.profile-fill { rgb("#f2f6f9") } else { none },
            inset: if style.profile-fill { (x: 9pt, y: 7pt) } else { (x: 0pt, y: 2pt) },
            radius: 2pt,
          )[
            #metadata(profile) <cv-profile>
            #text(size: size-body, fill: body-color)[#profile]
          ]
        })
      }
      if skills.len() > 0 {
        let skill-row(skill) = {
          let skill-value = skill.at("value", default: clean-skill-label(skill.label))
          grid(
            columns: (auto, 1fr),
            gutter: 8pt,
            text(size: size-meta, weight: "bold", fill: meta)[#skill.label],
            text(size: size-body, fill: body-color)[#skill-value],
          )
          v(2pt)
        }
        block(breakable: false, above: gap-section, { section("Skills"); skill-row(skills.at(0)) })
        for skill in skills.slice(1) { block(breakable: false, skill-row(skill)) }
      }
    }

    let experience-section = {
      for (i, entry) in experience.enumerate() {
        cv-entry(
          date: entry.date,
          title: entry.title,
          organization: entry.company,
          location: entry.location,
          content: entry.content,
          lead: if i == 0 { section("Experience") } else { none },
          marker: bullet,
        )
      }
    }

    let projects-section = {
      for (i, project) in projects.enumerate() {
        // Only the heading and title row are unbreakable, sticky to the
        // description. A whole project in one unbreakable block jumped to the
        // next page and left 15-19% of the previous page empty (owner E2E run).
        block(breakable: false, sticky: true, above: if i == 0 { gap-section } else { 1.2em }, below: 4pt)[
          #if i == 0 { section("Projects") }
          #text(weight: "bold", size: size-entry)[#project.title]
          #if project.url != "" [
            #h(5pt)
            #text(size: size-meta, fill: accent)[#link(project.url)[Project link]]
          ]
        ]
        if project.description != "" {
          block(above: 0pt, below: 4pt, text(size: size-body)[#project.description])
        }
        for highlight in project.highlights {
          block(breakable: false, above: 0pt, below: 3pt, grid(
            columns: (8pt, 1fr),
            gutter: 2pt,
            text(size: size-body)[#bullet],
            text(size: size-body)[#highlight],
          ))
        }
        v(gap-entry)
      }
    }

    let education-section = {
      for (i, entry) in education.enumerate() {
        cv-entry(
          date: entry.year,
          title: entry.degree,
          organization: entry.institution,
          location: "",
          content: if entry.field != "" { ([#entry.field],) } else { () },
          lead: if i == 0 { section("Education") } else { none },
          marker: bullet,
        )
      }
    }

    let certifications-section = {
      for (i, cert) in certifications.enumerate() {
        block(breakable: false, above: if i == 0 { gap-section } else { 1.2em }, {
          if i == 0 { section("Certifications") }
          grid(
            columns: (1fr, auto),
            gutter: 8pt,
            text(size: size-body)[#cert.name],
            text(size: size-meta, fill: meta)[#cert.date],
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
      block(breakable: false, above: gap-section, {
        section("Interests")
        text(size: size-body)[#interests.join(", ")]
      })
    }

    it
  }
}
