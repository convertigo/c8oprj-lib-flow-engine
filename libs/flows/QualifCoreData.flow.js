function QualifCoreData({ input, config, result }) {
  var profile = {"city":"Paris","metrics":{"temperature":38,"unit":"C"}}
  var selected = object.pick({ id: "pickFields", source: profile, keys: ["city","metrics.temperature"] })
  object.merge({ id: "mergeAlert", target: selected, source: {"alert":true}, out: "result.payload" })
  var payloadText = json.stringify({ id: "stringify", value: result.payload })
  json.parse({ id: "parse", text: payloadText, out: "result.roundtrip" })
  return result
}
