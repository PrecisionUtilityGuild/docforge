#import "theme.typ": *
#import "components.typ": *

#let data = json("data.json")

#set document(title: data.title)
#set text(font: body-font, size: 11pt, fill: brand-primary)
#set page(
  margin: (x: 2cm, y: 2.1cm),
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

#note-header(data.at("author", default: ""), data.at("date", default: ""))

#align(center)[
  #text(size: 23pt, weight: "bold")[#data.title]
]
#v(1em)

#summary-block(data.summary)

#note-body(data.body_md)

#if data.at("equations", default: ()).len() > 0 [
  #text(size: 14pt, weight: "bold", fill: brand-primary)[Key Equation]
  #v(0.35em)
  #equation-list(data.equations)
]

#if data.at("references", default: ()).len() > 0 [
  #v(0.5em)
  #text(size: 10pt, weight: "bold", fill: brand-primary)[References]
  #v(0.2em)
  #reference-list(data.references)
]
