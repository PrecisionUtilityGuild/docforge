#import "theme.typ": *

#let contact-line(contact) = {
  let parts = ()
  if contact.at("email", default: "") != "" { parts.push(contact.email) }
  if contact.at("phone", default: "") != "" { parts.push(contact.phone) }
  if contact.at("location", default: "") != "" { parts.push(contact.location) }
  if contact.at("linkedin", default: "") != "" { parts.push(contact.linkedin) }
  if contact.at("website", default: "") != "" { parts.push(contact.website) }
  align(center, text(size: 9pt, fill: brand-muted)[#parts.join(" · ")])
  v(0.6em)
}

#let summary-block(body) = {
  block(
    fill: rgb("#f8fafc"),
    inset: 12pt,
    radius: 4pt,
    width: 100%,
  )[
    #text(weight: "bold", fill: brand-primary)[Summary]
    #v(0.3em)
    #body
  ]
  v(1em)
}

#let experience-block(items) = {
  for job in items [
    #grid(
      columns: (1fr, auto),
      text(weight: "bold", fill: brand-primary)[#job.role · #job.company],
      align(right, text(size: 9pt, fill: brand-muted)[#job.dates]),
    )
    #v(0.2em)
    #for bullet in job.bullets [- #bullet]
    #v(0.6em)
  ]
}

#let education-block(items) = {
  for edu in items [
    #grid(
      columns: (1fr, auto),
      text(weight: "bold")[#edu.degree · #edu.institution],
      align(right, text(size: 9pt, fill: brand-muted)[#edu.dates]),
    )
    #if edu.at("details", default: "") != "" [
      #text(size: 9pt, fill: brand-muted)[#edu.details]
    ]
    #v(0.4em)
  ]
}

#let skills-block(skills) = {
  text[#skills.join(" · ")]
}
