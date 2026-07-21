#import "theme.typ": *
#import "docforge/markdown.typ": render-md
#import "@preview/mitex:0.2.7": mitex

#let note-header(author, date) = {
  grid(
    columns: (1fr, 1fr),
    text(fill: brand-muted, size: 9pt)[#author],
    align(right, text(fill: brand-muted, size: 9pt)[#date]),
  )
  v(0.4em)
  line(length: 100%, stroke: 0.6pt + brand-accent)
  v(0.9em)
}

#let summary-block(body) = {
  block(
    fill: rgb("#f0fdfa"),
    inset: 11pt,
    radius: 4pt,
    width: 100%,
    stroke: (left: 2pt + brand-accent),
  )[
    #text(weight: "bold", fill: brand-primary)[Summary]
    #v(0.25em)
    #body
  ]
  v(1em)
}

#let note-body(body) = [
  #text(size: 14pt, weight: "bold", fill: brand-primary)[Notes]
  #v(0.35em)
  #render-md(body)
  #v(0.9em)
]

#let equation-list(equations) = {
  for eq in equations [
    #block(
      fill: rgb("#f8fafc"),
      inset: 10pt,
      radius: 4pt,
      width: 100%,
    )[
      #align(center)[
        #figure(
          mitex(eq.latex),
          caption: [#eq.label],
          supplement: [Equation],
          alt: eq.at("alt", default: eq.label),
        )
      ]
    ]
    #v(0.5em)
  ]
}

#let reference-list(references) = {
  text(size: 9pt, fill: brand-muted)[
    #for (i, ref) in references.enumerate() [
      #if i > 0 [#linebreak()]
      #ref.citation#if ref.at("url", default: "") != "" [: #link(ref.url)[#ref.url]]
    ]
  ]
}
