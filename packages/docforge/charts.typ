#import "@preview/primaviz:0.7.0": bar-chart, line-chart, metric-card, pie-chart, area-chart, waterfall-chart, theme-from-json

#let chart-data-points(data) = (
  labels: data.map(d => d.label),
  values: data.map(d => float(str(d.value).replace(",", "").replace("$", "").replace("%", ""))),
)

// Build a primaviz theme from an optional accent color so charts match the
// document brand. Falls back to a balanced multi-hue palette.
#let _chart-theme(accent) = {
  let pal = if accent != none {
    (accent.to-hex(), accent.lighten(35%).to-hex(), accent.darken(20%).to-hex(), accent.lighten(60%).to-hex())
  } else {
    ("#2F6DF6", "#16A37B", "#E0A33E", "#C24D54", "#7C5CD6")
  }
  theme-from-json((
    palette: pal,
    "border-radius": 4,
  ))
}

// Charts fill the available column width (primaviz defaults to a tiny natural
// size) and get a readable height, rounded bars, and axis labels.
#let render-chart(chart, accent: none, width: 100%, height: 150pt) = {
  let opts = chart.at("options", default: (:))
  let t = _chart-theme(accent)
  // stacked_bar has no single-series stacked form in primaviz 0.7.0; render as
  // a standard bar so it degrades gracefully rather than producing nothing.
  if chart.type == "bar" or chart.type == "stacked_bar" {
    bar-chart(
      chart-data-points(chart.data),
      title: chart.at("title", default: none),
      width: width,
      height: height,
      bar-width: 0.62,
      radius: 3pt,
      show-values: opts.at("show_values", default: true),
      y-label: opts.at("unit", default: none),
      theme: t,
    )
  } else if chart.type == "line" {
    line-chart(
      chart-data-points(chart.data),
      title: chart.at("title", default: none),
      width: width,
      height: height,
      y-label: opts.at("unit", default: none),
      theme: t,
    )
  } else if chart.type == "area" {
    area-chart(
      chart-data-points(chart.data),
      title: chart.at("title", default: none),
      width: width,
      height: height,
      y-label: opts.at("unit", default: none),
      theme: t,
    )
  } else if chart.type == "waterfall" {
    waterfall-chart(
      chart-data-points(chart.data),
      title: chart.at("title", default: none),
      width: width,
      height: height,
      show-values: opts.at("show_values", default: true),
      y-label: opts.at("unit", default: none),
      theme: t,
    )
  } else if chart.type == "pie" or chart.type == "donut" {
    pie-chart(
      chart-data-points(chart.data),
      title: chart.at("title", default: none),
      size: height,
      donut: chart.type == "donut",
      theme: t,
    )
  } else if chart.type == "kpi_card" {
    let pt = chart.data.at(0, default: (label: "", value: 0))
    metric-card(
      value: float(str(pt.value).replace(",", "").replace("$", "")),
      label: pt.label,
      delta: opts.at("delta", default: none),
      theme: t,
    )
  }
}

#let render-charts(charts, accent: none) = {
  for chart in charts [
    #render-chart(chart, accent: accent)
    #v(1em)
  ]
}
