const _flow = { sourceVersion: 3, accessibility: "private" }

function sample_list_filter_sort_map({ input, config, result }) {
  local.cities = [
    { city: "Lyon", temperature: 31 },
    { city: "Paris", temperature: 38 },
    { city: "Marseille", temperature: 36 },
  ]
  keepHotCities: local.hotCities = local.cities.filter(item => item.temperature >= 35)
  sortByCity: local.sortedHotCities = list.sort({ items: local.hotCities, by: current.city })
  names: result.cities = local.sortedHotCities.map(item => item.city)
  result.count = result.cities.length
}
