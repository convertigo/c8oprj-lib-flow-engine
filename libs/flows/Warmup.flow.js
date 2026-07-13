function Warmup({ input, config, result }) {
  var values = [{"name":"beta","rank":2},{"name":"alpha","rank":1},{"name":"gamma","rank":3}]
  var selected = list.filter({ id: "filter", items: values, where: current.rank >= 1 })
  var ordered = list.sort({ id: "sort", items: selected, by: current.name })
  list.map({ id: "map", items: ordered, select: current.name, out: "result.names" })
  result.ready = true
  return result
}
