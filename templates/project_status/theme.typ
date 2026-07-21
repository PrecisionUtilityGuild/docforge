#let brand-primary = rgb("#172033")
#let brand-accent = rgb("#2563eb")
#let brand-accent-2 = rgb("#0f766e")
#let brand-muted = rgb("#64748b")
#let brand-rule = rgb("#d9e2f2")
#let brand-surface = rgb("#f6f8fb")
#let brand-background = rgb("#FFFFFF")
#let brand-text = rgb("#182230")
#let brand-footer = "Confidential Status"

#let body-font = "New Computer Modern"
#let heading-font = "New Computer Modern"

#let brand-logo = none
#let brand-logo-alt = ""
#let brand-header-bar() = []

#let rag-color(rag) = {
  if rag == "red" { rgb("#dc2626") }
  else if rag == "amber" { rgb("#d97706") }
  else { rgb("#16a34a") }
}
