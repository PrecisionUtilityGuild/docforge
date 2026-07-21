#import "theme.typ": *

#let adr-header(status, date) = {
  grid(
    columns: (1fr, auto),
    box(
      fill: status-color(status).lighten(85%),
      inset: (x: 8pt, y: 4pt),
      radius: 3pt,
    )[
      #text(size: 9pt, weight: "bold", fill: status-color(status))[#upper(status)]
    ],
    align(right, text(size: 9pt, fill: brand-muted)[#date]),
  )
  v(0.8em)
}

#let section-block(title, body) = [
  #text(size: 14pt, weight: "bold", fill: brand-primary)[#title]
  #v(0.3em)
  #body
  #v(0.8em)
]

#let alternatives-list(alternatives) = {
  for alt in alternatives [
    #text(weight: "bold")[#alt.title]
    #v(0.2em)
    #alt.description
    #v(0.6em)
  ]
}
