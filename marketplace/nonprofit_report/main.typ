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
#report-header(data.organization, data.year)

#align(center)[
  #text(size: 22pt, weight: "bold")[#data.title]
]
#v(1em)

= Our Mission
#data.mission
#v(0.6em)

= Impact at a Glance
#impact-cards(data.impact_metrics)

= Programs
#programs-list(data.programs)

= Financial Overview
#financials-table(data.financials)
#v(0.8em)

= Thank You
#thank-you-block(data.thank_you)
