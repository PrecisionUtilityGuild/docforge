#let _diagram-label(d, id) = {
  let matches = d.nodes.filter(n => n.id == id)
  if matches.len() > 0 {
    matches.first().label
  } else {
    id
  }
}

#let _diagram-edge-label(d, e) = {
  _diagram-label(d, e.at(0)) + " -> " + _diagram-label(d, e.at(1))
}

#let render-diagram(d) = {
  if d.type == "process" or d.type == "flowchart" or d.type == "tree" {
    if d.at("title", default: "") != "" [
      #text(size: 10pt, weight: "bold")[#d.title]
      #v(0.4em)
    ]

    grid(
      columns: d.nodes.map(_ => 1fr),
      gutter: 8pt,
      ..d.nodes.map(n => box(
        width: 100%,
        inset: 8pt,
        radius: 4pt,
        stroke: 0.6pt + luma(70%),
        fill: luma(96%),
      )[
        #align(center)[#text(size: 9pt, weight: "bold")[#n.label]]
      ]),
    )

    if d.edges.len() > 0 [
      #v(0.4em)
      #text(size: 8pt, fill: luma(45%))[
        #d.edges.map(e => _diagram-edge-label(d, e)).join("  |  ")
      ]
    ]
  }
}
