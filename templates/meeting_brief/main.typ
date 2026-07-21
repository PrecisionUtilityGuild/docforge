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
      #text(size: 8pt, fill: brand-muted)[#footer-label · #counter(page).display()]
    ]
  ],
)

#show heading: it => {
  set text(font: heading-font, fill: brand-primary)
  it
}

#brand-header-bar()

#brief-header(data.date)

#align(center)[
  #text(size: 22pt, weight: "bold")[#data.title]
]
#v(1em)

#objective-block(data.objective)

= Attendees
#attendees-list(data.attendees)
#v(1em)

= Agenda
#agenda-table(data.agenda)
#v(1em)

= Prep Items
#bullet-list(data.prep_items)
#v(1em)

= Background
#data.background
