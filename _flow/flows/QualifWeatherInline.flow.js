const _flow = { sourceVersion: 3 }

function QualifWeatherInline({ input, config, result }) {
  fetchWeather: local.weather = http.request({
    method: "GET",
    url: `file://${request.engineProjectDir}/fixtures/weather-alert.json`,
    allowFileUrl: true,
  })
  selectMetropoles: local.metropoles = json.select({ source: local.weather, path: "body.metropoles" })
  filterHot: local.hotMetropoles = local.metropoles.filter(item => item.temperature >= 35)
  sortHot: local.sortedHotMetropoles = list.sort({ items: local.hotMetropoles, by: current.city })
  mapCities: result.hotCities = local.sortedHotMetropoles.map(item => item.city)
  result.message = "Flow engine qualification passed"
}
