// c8o: FlowScript spike. Function calls are Flow blocks; named arguments are block properties.
// c8o: Patch with the returned revision. The engine validates and compiles this code back to Flow YAML.

const _flow = {
  "sourceVersion": 2,
}

function sample_list_filter_sort_map({ input, config, result }) {
  set({
    $$id: "cities",
    path: "local.cities",
    value: [
      {
        city: "Lyon",
        temperature: 31,
      },
      {
        city: "Paris",
        temperature: 38,
      },
      {
        city: "Marseille",
        temperature: 36,
      },
    ],
  })
  local.hotCities = list.filter({
    $$id: "keepHotCities",
    items: local.cities,
    where: current.temperature >= 35,
  })
  local.sortedHotCities = list.sort({
    $$id: "sortByCity",
    items: local.hotCities,
    by: current.city,
  })
  result.cities = list.map({
    $$id: "names",
    items: local.sortedHotCities,
    select: current.city,
  })
  set({
    $$id: "count",
    path: "result.count",
    value: result.cities.length,
  })
}
