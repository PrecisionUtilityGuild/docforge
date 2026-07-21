#import "theme.typ": *

#let pitch-header(company, tagline) = {
  align(center)[
    #text(size: 12pt, weight: "bold", fill: brand-accent)[#company]
    #v(0.3em)
    #text(size: 10pt, fill: brand-muted, style: "italic")[#tagline]
  ]
  v(0.8em)
  line(length: 100%, stroke: 0.5pt + brand-accent)
  v(0.8em)
}

#let section-block(title, body) = [
  #text(size: 13pt, weight: "bold", fill: brand-primary)[#title]
  #v(0.3em)
  #body
  #v(0.7em)
]

#let team-grid(members) = {
  grid(
    columns: (1fr, 1fr),
    gutter: 10pt,
    ..members.map(m => {
      box(
        width: 100%,
        fill: rgb("#f0fdf4"),
        inset: 10pt,
        radius: 4pt,
        stroke: 0.5pt + brand-accent.lighten(60%),
      )[
        #text(weight: "bold")[#m.name]
        #v(0.15em)
        #text(size: 9pt, fill: brand-accent)[#m.role]
        #if m.at("bio", default: "") != "" [
          #v(0.2em)
          #text(size: 9pt, fill: brand-muted)[#m.bio]
        ]
      ]
    }),
  )
}

#let ask-callout(ask) = {
  box(
    width: 100%,
    fill: brand-accent.lighten(90%),
    inset: 14pt,
    radius: 4pt,
    stroke: 1pt + brand-accent,
  )[
    #text(size: 14pt, weight: "bold", fill: brand-accent)[The Ask: #ask.amount]
    #if ask.at("use_of_funds", default: "") != "" [
      #v(0.4em)
      #text(size: 10pt)[#ask.use_of_funds]
    ]
  ]
}
