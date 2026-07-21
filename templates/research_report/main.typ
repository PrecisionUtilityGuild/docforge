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

#report-header(data.at("author", default: ""), data.at("date", default: ""))

#align(center)[
  #text(size: 22pt, weight: "bold")[#data.title]
]
#v(1em)

#abstract-block(data.abstract)

#for section in data.sections [
  #section-block(section)
]

#if data.at("equations", default: ()).len() > 0 [
  = Key Equations
  #for eq in data.equations [
    #equation-block(eq)
  ]
]

= Findings
#findings-table(data.findings)

#if data.at("sources", default: ()).len() > 0 [
  #pagebreak()
  #align(left)[
    #text(size: 16pt, weight: "bold")[Appendix A: Sources and References]
  ]
  #v(0.6em)
  #sources-list(data.sources)
]

#if data.at("appendix", default: ()).len() > 0 [
  #pagebreak()
  #align(left)[
    #text(size: 16pt, weight: "bold")[Appendix B: Supplementary Material]
  ]
  #v(0.6em)
  #for block in data.appendix [
    #text(weight: "bold")[#block.title]
    #v(0.2em)
    #block.body
    #v(0.6em)
  ]
]
