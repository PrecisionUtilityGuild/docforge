#import "theme.typ": *

#let postmortem-header(severity, date) = {
  grid(
    columns: (1fr, auto),
    box(
      fill: severity-color(severity).lighten(85%),
      inset: (x: 8pt, y: 4pt),
      radius: 3pt,
    )[
      #text(size: 9pt, weight: "bold", fill: severity-color(severity))[#upper(severity)]
    ],
    align(right, text(size: 9pt, fill: brand-muted)[#date]),
  )
  v(0.8em)
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

#let timeline-table(events) = {
  table(
    columns: (auto, 1fr),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Time*], [*Event*]),
    ..events.map(e => (e.time, e.event)).flatten(),
  )
}

#let impact-block(impact) = {
  block(
    fill: rgb("#fef2f2"),
    inset: 12pt,
    radius: 4pt,
    width: 100%,
  )[
    #text(weight: "bold")[Impact]
    #v(0.3em)
    Duration: #impact.duration #linebreak()
    #if impact.at("users_affected", default: "") != "" [Users affected: #impact.users_affected #linebreak()]
    #if impact.at("services", default: ()).len() > 0 [Services: #impact.services.join(", ")]
  ]
}

#let bullet-list(items) = {
  for item in items [
    - #item
  ]
}

#let action-table(actions) = {
  table(
    columns: (1.5fr, 1fr, 1fr, auto),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Action*], [*Owner*], [*Due*], [*Status*]),
    ..actions
      .map(a => (
        a.title,
        a.at("owner", default: "—"),
        a.at("due", default: "—"),
        a.at("status", default: "open"),
      ))
      .flatten(),
  )
}
