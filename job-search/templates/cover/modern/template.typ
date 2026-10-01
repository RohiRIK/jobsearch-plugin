// ─── Typst Modern Cover Letter Template ────────────────────────────────────
// Semi-formal, direct opener for tech/startup roles.
// Matches modern CV design system — same accent, fonts, clean sans-serif.

#import "../../design-system.typ": *

#let cover-letter(
  name: "",
  email: "",
  phone: "",
  linkedin: "",
  date: "",
  recipient: "",
  company: "",
  role: "",
  paragraphs: (),
  bullets: (),
  closing: "Kind regards,",
  signature: "",
  logo: "",
) = {
  return (it) => {
    set page(paper: "a4", margin: (x: 2.3cm, y: 2.3cm))
    set text(font: body-font, size: 11pt, fill: body-color)
    // Ragged-right body avoids the rivers and awkward word breaks that short
    // cover-letter paragraphs get under full justification.
    set par(leading: 0.6em, justify: false)

    // ─── Header with optional logo ──────────────────────────────────────
    grid(
      columns: (auto, 1fr),
      gutter: 12pt,
      align(left, {
        if logo != "" {
          image(logo, height: 1.2cm)
          v(2pt)
        }
        text(size: 24pt, weight: "bold", fill: accent)[#name]
        v(2pt)
        let items = ()
        if email != "" { items.push(email) }
        if phone != "" { items.push(phone) }
        if linkedin != "" { items.push(link(linkedin)[LinkedIn]) }
        text(size: size-meta, fill: meta)[#items.join([#h(6pt)•#h(6pt)])]
      }),
      align(right, {
        if date != "" {
          text(size: size-meta, fill: meta)[#date]
        }
        if company != "" and role != "" {
          v(6pt)
          text(size: size-meta, fill: meta)[Re: #role]
          linebreak()
          text(size: size-meta, fill: meta)[#company]
        }
      }),
    )

    v(12pt)

    // ─── Separator line ─────────────────────────────────────────────────
    line(length: 100%, stroke: 0.4pt + accent)
    v(12pt)

    // ─── Recipient ─────────────────────────────────────────────────────
    if recipient != "" {
      text(size: 11pt, weight: "medium")[Dear #recipient,]
      v(6pt)
    }
    if company != "" and role != "" {
      text(size: 10pt, weight: "bold", fill: accent)[Application: #role — #company]
      v(10pt)
    }

    // ─── Body Paragraphs ──────────────────────────────────────────────
    for p in paragraphs {
      text(size: 11pt)[#p]
      v(8pt)
    }

    // ─── Bullet Points ─────────────────────────────────────────────────
    if bullets.len() > 0 {
      for b in bullets {
        pad(left: indent-bullet)[text(size: 11pt)[• #b]]
        v(3pt)
      }
      v(8pt)
    }

    // ─── Closing ────────────────────────────────────────────────────────
    text(size: 11pt)[#closing]
    v(6pt)

    if signature != "" {
      image(signature, width: 3cm)
      v(4pt)
    }

    text(size: 11pt, weight: "bold", fill: accent)[#name]

    it
  }
}
