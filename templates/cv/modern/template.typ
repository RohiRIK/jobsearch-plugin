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
  education-first: false,
  is-rtl: false,
  layout: "modern",
) = {
  return (it) => {
    let dense = layout in ("ats-compact", "technical", "resume-compact", "dense")
    let style-accent = if layout == "executive" { rgb("#1f3a5f") } else if layout == "creative" { rgb("#7c3aed") } else if layout == "technical" { rgb("#0f766e") } else { accent }
    let section = title => section-title(title, fill: style-accent)
    let bullet = if layout in ("executive", "minimal") { "–" } else { "•" }
    set page(paper: "a4", margin: (x: if dense { 1.6cm } else { margin-x }, y: if dense { 1.35cm } else { 1.6cm }))
    set text(font: body-font, size: if dense { 9.3pt } else { size-body })

    if is-rtl {
      set text(dir: rtl, fill: body-color)
    } else {
      set text(fill: body-color)
    }

    set par(leading: if dense { 0.45em } else { leading-body }, justify: false)

    // Header: every contact value remains literal text in reading order. The
    // optional photo is decorative and market-gated by the renderer; it never
    // replaces literal contact text.
    let header-text = {
      text(font: heading-font, size: if layout == "executive" { 32pt } else { size-name }, weight: "bold", fill: style-accent)[#name]
      if lastname != "" [
        #h(7pt)
        #text(font: heading-font, size: if layout == "executive" { 32pt } else { size-name }, weight: "bold", fill: style-accent)[#lastname]
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

    if profile != "" {
      section("Profile")
      block(
        width: 100%,
        fill: rgb("#f2f6f9"),
        inset: (x: 9pt, y: 7pt),
        radius: 2pt,
      )[
        #metadata(profile) <cv-profile>
        #text(size: size-body, fill: body-color)[#profile]
      ]
    }

    if skills.len() > 0 {
      section("Skills")
      for skill in skills {
        let skill-value = skill.at("value", default: clean-skill-label(skill.label))
        grid(
          columns: (auto, 1fr),
          gutter: 8pt,
          text(size: size-meta, weight: "bold", fill: meta)[#skill.label],
          text(size: size-body, fill: body-color)[#skill-value],
        )
        v(2pt)
      }
    }

    let experience-section = {
      if experience.len() > 0 {
        section("Experience")
        for entry in experience {
          cv-entry(
            date: entry.date,
            title: entry.title,
            organization: entry.company,
            location: entry.location,
            content: entry.content,
          )
        }
      }
    }

    let projects-section = {
      if projects.len() > 0 {
        section("Projects")
        for project in projects {
          block(breakable: false)[
            #text(weight: "bold", size: size-entry)[#project.title]
            #if project.url != "" [
              #h(5pt)
              #text(size: size-meta, fill: accent)[#link(project.url)[Project link]]
            ]
            #if project.description != "" [
              #v(2pt)
              #text(size: size-body)[#project.description]
            ]
            #if project.highlights.len() > 0 [
              #v(2pt)
              #for highlight in project.highlights [
                #grid(
                  columns: (8pt, 1fr),
                  gutter: 2pt,
                  text(size: size-body)[#bullet],
                  text(size: size-body)[#highlight],
                )
                #v(1pt)
              ]
            ]
          ]
          v(gap-entry)
        }
      }
    }

    let education-section = {
      if education.len() > 0 {
        section("Education")
        for entry in education {
          cv-entry(
            date: entry.year,
            title: entry.degree,
            organization: entry.institution,
            location: "",
            content: if entry.field != "" { ([#entry.field],) } else { () },
          )
        }
      }
    }

    let certifications-section = {
      if certifications.len() > 0 {
        section("Certifications")
        for cert in certifications {
          block(breakable: false)[
            #grid(
              columns: (1fr, auto),
              gutter: 8pt,
              text(size: size-body)[#cert.name],
              text(size: size-meta, fill: meta)[#cert.date],
            )
          ]
          v(2pt)
        }
      }
    }

    // Section order is a market convention, not a style choice: German-speaking
    // markets place education before work experience, most others lead with
    // experience. src/market-profiles.ts owns which is which; the renderer
    // passes the answer in rather than each template guessing.
    if education-first {
      education-section
      certifications-section
      experience-section
      projects-section
    } else {
      experience-section
      projects-section
      education-section
      certifications-section
    }

    it
  }
}
