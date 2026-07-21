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

#set document(title: data.title)
#set text(font: body-font, size: 11pt, fill: brand-primary)
#set page(
  margin: (x: 2cm, y: 2.2cm),
  footer: context [
    #align(center)[
      #text(size: 8pt, fill: brand-muted)[#data.rfc_id · #footer-label · #counter(page).display()]
    ]
  ],
)

#show heading: it => {
  set text(font: heading-font, fill: brand-primary)
  it
}

#brand-header-bar()
#rfc-header(data.rfc_id, data.status, data.authors)

#align(center)[
  #text(size: 22pt, weight: "bold")[#data.title]
]
#v(1em)

#section-block("Summary", data.summary)
#section-block("Motivation", data.motivation)
#section-block("Specification", data.specification)

= Alternatives Considered
#alternatives-list(data.alternatives)

= Unresolved Questions
#questions-list(data.unresolved_questions)
