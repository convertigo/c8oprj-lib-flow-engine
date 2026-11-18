const _flow = { sourceVersion: 3 }

function QualifCoreData({ input, config, result }) {
  local.profile = { city: "Paris", metrics: { temperature: 38, unit: "C" } }
  pickFields: local.selected = object.pick({ source: local.profile, keys: ["city", "metrics.temperature"] })
  mergeAlert: result.payload = object.merge({ target: local.selected, source: { alert: true } })
  stringify: local.payloadText = JSON.stringify(result.payload)
  parse: result.roundtrip = JSON.parse(local.payloadText)
}
