function sample_list_filter_sort_map({ input, config, result }) {
  var cities = [{"city":"Lyon","temperature":31},{"city":"Paris","temperature":38},{"city":"Marseille","temperature":36}]
  var hotCities = list.filter({ id: "keepHotCities", items: cities, where: current.temperature >= 35 })
  var sortedHotCities = list.sort({ id: "sortByCity", items: hotCities, by: current.city })
  list.map({ id: "names", items: sortedHotCities, select: current.city, out: "result.cities" })
  result.count = result.cities.length
  return result
}
