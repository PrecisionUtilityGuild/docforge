#import "theme.typ": *
#import "components.typ": *

#let data = json("data.json")

#let footer-label = {
  let snippets = data.at("typst_snippets", default: none)
  if snippets != none {
    let note = snippets.at("footer_note", default: "")
    if note != "" { note } else { brand-footer }
  } else {
    brand-footer
  }
}

#set document(title: data.name)
#set text(font: body-font, size: 11pt, fill: brand-primary)
#set page(
  margin: (x: 2cm, y: 2.2cm),
  footer: context [
    #align(center)[
      #text(size: 8pt, fill: brand-muted)[#footer-label · #counter(page).display()]
    ]
  ],
)

#show heading: it => {
  set text(font: heading-font, fill: brand-primary)
  it
}

#brand-header-bar()

#align(center)[
  #text(size: 24pt, weight: "bold")[#data.name]
  #v(0.2em)
  #text(size: 14pt, fill: brand-accent)[#data.title]
]
#v(0.4em)

#contact-line(data.contact)

#line(length: 100%, stroke: 0.5pt + brand-accent)
#v(0.8em)

#summary-block(data.summary)

= Experience
#experience-block(data.experience)

= Education
#education-block(data.education)

= Skills
#skills-block(data.skills)
