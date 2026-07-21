// Forge board-pack identity — shares the dark-hero + chip + surface system used
// by project_status / incident_report / sales_proposal so all Forge PDFs read as
// one product.
#let brand-primary = rgb("#172033")
#let brand-accent = rgb("#2563eb")
#let brand-accent-2 = rgb("#0f766e")
#let brand-muted = rgb("#64748b")
#let brand-rule = rgb("#d9e2f2")
#let brand-surface = rgb("#f6f8fb")
#let brand-background = rgb("#FFFFFF")
#let brand-text = rgb("#182230")
#let brand-footer = "Board Confidential"

#let body-font = "New Computer Modern"
#let heading-font = "New Computer Modern"

#let brand-logo = none
#let brand-logo-alt = ""
#let brand-header-bar() = []

#let trend-symbol(trend) = {
  if trend == "up" { "▲" } else if trend == "down" { "▼" } else { "●" }
}

#let trend-color(trend) = {
  if trend == "up" { rgb("#16a34a") } else if trend == "down" { rgb("#dc2626") } else { brand-muted }
}
