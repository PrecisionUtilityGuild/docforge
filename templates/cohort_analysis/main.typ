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

#report-header(data.period)

#align(center)[
  #text(size: 22pt, weight: "bold")[#data.title]
]
#v(1em)

= Cohort Retention
#cohort-table(data.cohorts)
#v(1em)

#if data.at("charts", default: ()).len() > 0 [
  = Charts
  #render-charts(data.charts, accent: brand-accent)
  #v(1em)
]

= Insights
#insights-block(data.insights)
