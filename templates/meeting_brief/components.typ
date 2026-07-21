#import "theme.typ": *

#let brief-header(date) = {
  align(right, text(size: 9pt, fill: brand-muted)[#date])
  v(0.8em)
}

#let objective-block(body) = {
  block(
    fill: rgb("#f8fafc"),
    inset: 12pt,
    radius: 4pt,
    width: 100%,
  )[
    #text(weight: "bold", fill: brand-primary)[Objective]
    #v(0.3em)
    #body
  ]
  v(1em)
}

#let attendees-list(attendees) = {
  for person in attendees [
    - #person
  ]
}

#let agenda-table(items) = {
  table(
    columns: (1fr, auto),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Topic*], [*Duration*]),
    ..items.map(item => (item.topic, item.duration)).flatten(),
  )
}

#let bullet-list(items) = {
  for item in items [
    - #item
  ]
}
