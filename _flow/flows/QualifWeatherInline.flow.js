// c8o: FlowScript spike. Function calls are Flow blocks; named arguments are block properties.
// c8o: Patch with the returned revision. The engine validates and compiles this code back to Flow YAML.

const _flow = {
  "sourceVersion": 2,
}

function QualifWeatherInline({ input, config, result }) {
  http.request({
    $$id: "fetchWeather",
    $$out: "local.weather",
    method: "GET",
    url: `file://${request.engineProjectDir}/fixtures/weather-alert.json`,
    out: "local.weather",
  })
  json.select({
    $$id: "selectMetropoles",
    $$out: "local.metropoles",
    source: local.weather,
    path: "body.metropoles",
    out: "local.metropoles",
  })
  list.filter({
    $$id: "filterHot",
    $$out: "local.hotMetropoles",
    items: local.metropoles,
    where: current.temperature >= 35,
    out: "local.hotMetropoles",
  })
  list.sort({
    $$id: "sortHot",
    $$out: "local.sortedHotMetropoles",
    items: local.hotMetropoles,
    by: current.city,
    out: "local.sortedHotMetropoles",
  })
  list.map({
    $$id: "mapCities",
    $$out: "result.hotCities",
    items: local.sortedHotMetropoles,
    select: current.city,
    out: "result.hotCities",
  })
  set({
    $$id: "message",
    path: "result.message",
    value: "Flow engine qualification passed",
  })
  return result
}
