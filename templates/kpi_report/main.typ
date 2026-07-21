#import "theme.typ": *
#import "components.typ": *

#let data = json("data.json")

#set document(title: data.title)
#set text(font: body-font, size: 10pt, fill: brand-text, lang: "en")
#set page(
  margin: (x: 1.55cm, y: 1.65cm),
  footer: context [
    #grid(
      columns: (1fr, auto),
      text(size: 7.5pt, fill: brand-muted)[#brand-footer],
      align(right)[#text(size: 7.5pt, fill: brand-muted)[Page #counter(page).display()]],
    )
  ],
)

#show heading: it => {
  set text(font: heading-font, fill: brand-primary)
  it
}

#brand-header-bar()

#hero(data)

#section-title("Key metrics", eyebrow: "How the numbers landed")
#kpi-cards(data.kpis)

#if data.at("charts", default: ()).len() > 0 [
  #section-title("Trends", eyebrow: "Visual read")
  #render-charts(data.charts, accent: brand-accent)
]

#if data.commentary != data.summary [
  #section-title("Commentary", eyebrow: "Context behind the numbers")
  #text(size: 10pt, fill: brand-text)[#data.commentary]
]

#if data.at("risks", default: ()).len() > 0 [
  #section-title("Risks", eyebrow: "Metrics off target")
  #risk-table(data.risks)
]

#if data.at("asks", default: ()).len() > 0 [
  #section-title("Board asks", eyebrow: "Decisions requested")
  #ask-table(data.asks)
]
