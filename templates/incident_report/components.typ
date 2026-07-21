#import "theme.typ": *

#let safe(value, fallback: "—") = {
  if value == none or str(value) == "" { fallback } else { value }
}

#let severity_badge(severity) = {
  box(
    fill: severity-color(severity),
    inset: (x: 9pt, y: 4pt),
    radius: 3pt,
  )[
    #text(size: 8pt, weight: "bold", fill: white)[SEV #upper(severity)]
  ]
}

#let stat_card(label, value) = {
  box(
    width: 100%,
    fill: white,
    stroke: 0.45pt + brand-rule,
    radius: 3pt,
    inset: (x: 9pt, y: 7pt),
  )[
    #text(size: 7.5pt, fill: brand-muted, tracking: 0.45pt)[#upper(label)]
    #v(0.25em)
    #text(size: 10pt, weight: "semibold", fill: brand-primary)[#safe(value)]
  ]
}

#let incident_hero(data) = {
  block(
    width: 100%,
    fill: brand-primary,
    radius: 6pt,
    inset: 17pt,
  )[
    #grid(
      columns: (1fr, auto),
      [
        #text(size: 8pt, fill: brand-rule, tracking: 0.8pt)[INCIDENT REPORT]
        #v(0.65em)
        #text(size: 24pt, weight: "bold", fill: white)[#data.title]
      ],
      severity_badge(data.severity),
    )
    #v(0.7em)
    #line(length: 100%, stroke: 0.6pt + brand-muted)
    #v(0.7em)
    #text(size: 10.5pt, fill: rgb("#f4f4f5"))[#data.summary]
  ]
  v(0.7em)
  grid(
    columns: (1fr, 1fr, 1fr),
    gutter: 8pt,
    stat_card("Incident", data.at("incident_id", default: "INC-UNKNOWN")),
    stat_card("Duration", data.impact.duration),
    stat_card("Date", data.at("date", default: "")),
  )
}

#let section_title(title, eyebrow: none) = {
  v(0.7em)
  if eyebrow != none [
    #text(size: 7.5pt, fill: brand-accent, weight: "bold", tracking: 0.7pt)[#upper(eyebrow)]
    #v(0.12em)
  ]
  text(size: 15pt, weight: "bold", fill: brand-primary)[#title]
  v(0.22em)
  line(length: 100%, stroke: 0.55pt + brand-rule)
  v(0.45em)
}

#let timeline_table(events) = {
  table(
    columns: (auto, 1fr),
    inset: (x: 8pt, y: 7pt),
    stroke: 0.45pt + brand-rule,
    fill: (_, y) => if y == 0 { brand-primary } else { white },
    table.header(
      text(fill: white, weight: "bold")[Time],
      text(fill: white, weight: "bold")[Event],
    ),
    ..events.map(e => (
      text(weight: "semibold", fill: severity-color("high"))[#e.time],
      e.event,
    )).flatten(),
  )
}

#let impact_block(impact) = {
  box(
    fill: rgb("#fff7ed"),
    stroke: 0.55pt + rgb("#fed7aa"),
    inset: 12pt,
    radius: 5pt,
    width: 100%,
  )[
    #grid(
      columns: (1fr, 1fr),
      gutter: 8pt,
      stat_card("Duration", impact.duration),
      stat_card("Users affected", impact.at("users_affected", default: "")),
    )
    #if impact.at("services", default: ()).len() > 0 [
      #v(0.65em)
      #text(size: 8pt, fill: brand-muted, tracking: 0.5pt)[SERVICES]
      #v(0.25em)
      #text(weight: "semibold", fill: brand-primary)[#impact.services.join("  ·  ")]
    ]
  ]
}

#let root_cause_block(root) = {
  box(
    width: 100%,
    fill: rgb("#fef2f2"),
    stroke: 0.55pt + rgb("#fecaca"),
    radius: 5pt,
    inset: 12pt,
  )[
    #text(size: 8pt, fill: brand-accent, weight: "bold", tracking: 0.6pt)[ROOT CAUSE]
    #v(0.35em)
    #text(size: 10.5pt, fill: brand-primary, weight: "semibold")[#root]
  ]
}

#let action_status(status) = {
  let color = if status == "done" { rgb("#15803d") } else if status == "in_progress" { rgb("#b45309") } else { brand-accent-2 }
  text(fill: color, weight: "semibold")[#status.replace("_", " ")]
}

#let action_table(actions) = {
  table(
    columns: (1.6fr, 0.72fr, 0.82fr, 0.72fr),
    inset: (x: 7pt, y: 6.5pt),
    stroke: 0.45pt + brand-rule,
    fill: (_, y) => if y == 0 { brand-primary } else { white },
    table.header(
      text(fill: white, weight: "bold")[Action],
      text(fill: white, weight: "bold")[Owner],
      text(fill: white, weight: "bold")[Due],
      text(fill: white, weight: "bold")[Status],
    ),
    ..actions
      .map(a => (
        text(weight: "semibold", fill: brand-primary)[#a.title],
        a.at("owner", default: "—"),
        a.at("due", default: "—"),
        action_status(a.at("status", default: "open")),
      ))
      .flatten(),
  )
}

#let evidence_block(body) = {
  box(
    width: 100%,
    fill: brand-surface,
    stroke: 0.45pt + brand-rule,
    radius: 4pt,
    inset: 10pt,
  )[
    #text(size: 8pt, fill: brand-muted, tracking: 0.5pt)[EVIDENCE]
    #v(0.3em)
    #text(size: 9pt, fill: brand-primary)[#body]
  ]
}
