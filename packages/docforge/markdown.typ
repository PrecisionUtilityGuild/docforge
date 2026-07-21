#import "@preview/cmarker:0.1.6": render as md-render

#let render-md(text) = md-render(text)

#let section-body(section) = {
  if section.at("body_md", default: "") != "" {
    render-md(section.body_md)
  } else {
    section.at("body", default: "")
  }
}
