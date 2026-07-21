#import "theme.typ": *
#import "components.typ": *

#let data = json("data.json")

#let footer-label = {
  let snippets = data.at("typst_snippets", default: none)
  if snippets != none {
    let note = snippets.at("footer_note", default: "")
    if note != "" { note } else { brand-footer }
  } else {
    brand-footer
  }
}

#set document(title: data.title)
#set text(font: body-font, size: 10pt, fill: brand-text, lang: "en")
#set page(
  margin: (x: 1.55cm, y: 1.65cm),
  footer: context [
    #grid(
      columns: (1fr, auto),
      text(size: 7.5pt, fill: brand-muted)[#footer-label],
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

#section-title("Next moves", eyebrow: "Recommended action")
#callout("What should happen next", data.next_steps, tone: brand-accent-2)

#if data.blockers.len() > 0 [
  #section-title("Risks and blockers", eyebrow: "Needs attention")
  #callout("Resolve before green", data.blockers, tone: rag-color("red"))
]

#section-title("Workstreams", eyebrow: "Where the work stands")
#workstreams-grid(data.workstreams)

#if data.at("source_audit", default: none) != none [
  #block(breakable: false)[
    #section-title("Forge grounding proof", eyebrow: "Why this is not just a summary")
    #source-audit-card(data.source_audit)
  ]
]

#if data.at("evidence", default: ()).len() > 0 [
  #block(breakable: false)[
    #section-title("Evidence ledger", eyebrow: "Slack source snippets")
    #text(size: 8.8pt, fill: brand-muted)[Grounding snippets from the source channel/search results used to assemble this status.]
    #v(0.4em)
    #evidence-ledger(data.evidence)
  ]
]
