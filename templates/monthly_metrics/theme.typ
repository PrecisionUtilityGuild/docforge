#let brand-primary = rgb("#111111")
#let brand-accent = rgb("#059669")
#let brand-muted = rgb("#64748b")
#let brand-background = rgb("#FFFFFF")
#let brand-text = rgb("#1A1A1A")
#let brand-footer = "Metrics Confidential"

#let body-font = "Libertinus Serif"
#let heading-font = "Libertinus Serif"

#let brand-logo = none
#let brand-logo-alt = ""
#let brand-header-bar() = []

#let trend-symbol(trend) = {
  if trend == "up" { "▲" }
  else if trend == "down" { "▼" }
  else { "●" }
}

#let trend-color(trend) = {
  if trend == "up" { rgb("#059669") }
  else if trend == "down" { rgb("#dc2626") }
  else { brand-muted }
}
