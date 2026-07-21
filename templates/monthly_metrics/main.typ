#import "theme.typ": *
#import "components.typ": *

#let data = json("data.json")

#set document(title: data.title)
#set text(font: body-font, size: 11pt, fill: brand-primary)
#set page(
  margin: (x: 2cm, y: 2.2cm),
  footer: context [
    #align(center)[
      #text(size: 8pt, fill: brand-muted)[#brand-footer · #counter(page).display()]
    ]
  ],
)

#show heading: it => {
  set text(font: heading-font, fill: brand-primary)
  it
}

#brand-header-bar()

#report-header(data.period, data.at("author", default: ""))

#align(center)[
  #text(size: 22pt, weight: "bold")[#data.title]
]
#v(1em)

#block(
  fill: rgb("#f8fafc"),
  inset: 12pt,
  radius: 4pt,
  width: 100%,
)[
  #text(weight: "bold")[Summary]
  #v(0.3em)
  #data.summary
]
#v(1em)

= Metrics
#metric-cards(data.metrics)

= Charts
#render-charts(data.charts, accent: brand-accent)

= Commentary
#data.commentary
