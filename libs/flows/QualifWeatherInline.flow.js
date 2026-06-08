function QualifWeatherInline({ input, config, result }) {
  var weather = http.request({ id: "fetchWeather", method: "GET", url: `file://${request.engineProjectDir}/fixtures/weather-alert.json` })
  var metropoles = json.select({ id: "selectMetropoles", source: weather, path: "body.metropoles" })
  var hotMetropoles = list.filter({ id: "filterHot", items: metropoles, where: current.temperature >= 35 })
  var sortedHotMetropoles = list.sort({ id: "sortHot", items: hotMetropoles, by: current.city })
  list.map({ id: "mapCities", items: sortedHotMetropoles, select: current.city, out: "result.hotCities" })
  result.message = "Flow engine qualification passed"
  return result
}
