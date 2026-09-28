// c8o: Flow source (FlowScript, sourceVersion 2). Calls are Flow blocks; plain keys are business properties, $$ keys are engine attributes and slots.
// c8o: Edit in the Studio or with the Flow MCP code tools; patch with the returned revision.

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
