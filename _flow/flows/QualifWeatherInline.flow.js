// c8o: FlowScript spike. Function calls are Flow blocks; named arguments are block properties.
// c8o: Patch with the returned revision. The engine validates and compiles this code back to Flow YAML.

const _flow = {
  "sourceVersion": 2,
}

function QualifWeatherInline({ input, config, result }) {
  local.weather = http.request({
    $$id: "fetchWeather",
    method: "GET",
    url: `file://${request.engineProjectDir}/fixtures/weather-alert.json`,
  })
  local.metropoles = json.select({
    $$id: "selectMetropoles",
    source: local.weather,
    path: "body.metropoles",
  })
  local.hotMetropoles = list.filter({
    $$id: "filterHot",
    items: local.metropoles,
    where: current.temperature >= 35,
  })
  local.sortedHotMetropoles = list.sort({
    $$id: "sortHot",
    items: local.hotMetropoles,
    by: current.city,
  })
  result.hotCities = list.map({
    $$id: "mapCities",
    items: local.sortedHotMetropoles,
    select: current.city,
  })
  set({
    $$id: "message",
    path: "result.message",
    value: "Flow engine qualification passed",
  })
}
