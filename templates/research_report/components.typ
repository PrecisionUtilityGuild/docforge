#import "theme.typ": *
#import "docforge/markdown.typ": section-body
#import "@preview/mitex:0.2.7": mitex

#let report-header(author, date) = {
  grid(
    columns: (1fr, 1fr),
    text(fill: brand-muted, size: 9pt)[#author],
    align(right, text(fill: brand-muted, size: 9pt)[#date]),
  )
  v(0.8em)
}

#let abstract-block(body) = {
  block(
    fill: rgb("#faf5ff"),
    inset: 12pt,
    radius: 4pt,
    width: 100%,
  )[
    #text(weight: "bold")[Abstract]
    #v(0.3em)
    #body
  ]
  v(1em)
}

#let section-block(section) = [
  #metadata((type: "section", title: section.title, empty: section.at("body", default: "") == "" and section.at("body_md", default: "") == ""))
  <lint-section>
  #metadata((type: "todo_placeholder", found: (section.at("body", default: "") + section.at("body_md", default: "")).contains("TODO")))
  <lint-todo>
  #text(size: 14pt, weight: "bold", fill: brand-primary)[#section.title]
  #v(0.3em)
  #section-body(section)
  #v(0.8em)
]

#let equation-block(eq) = {
  figure(
    mitex(eq.latex),
    caption: [#eq.label],
    alt: eq.at("alt", default: eq.label),
  )
  v(0.4em)
}

#let findings-table(findings) = {
  table(
    columns: (1fr, auto),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Finding*], [*Confidence*]),
    ..findings
      .map(f => (
        {
          text(weight: "bold")[#f.title]
          linebreak()
          text(size: 9pt)[#f.summary]
        },
        f.at("confidence", default: "medium"),
      ))
      .flatten(),
  )
}

#let sources-list(sources) = {
  for (i, s) in sources.enumerate() [
    #[#(i + 1). #s.citation#if s.at("url", default: "") != "" [ — #link(s.url)[#s.url]]]
    #linebreak()
  ]
}
