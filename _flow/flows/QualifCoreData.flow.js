// c8o: FlowScript spike. Function calls are Flow blocks; named arguments are block properties.
// c8o: Patch with the returned revision. The engine validates and compiles this code back to Flow YAML.

const _flow = {
  "sourceVersion": 2,
}

function QualifCoreData({ input, config, result }) {
  set({
    $$id: "profile",
    path: "local.profile",
    value: {
      city: "Paris",
      metrics: {
        temperature: 38,
        unit: "C",
      },
    },
  })
  local.selected = object.pick({
    $$id: "pickFields",
    source: local.profile,
    keys: [
      "city",
      "metrics.temperature",
    ],
  })
  result.payload = object.merge({
    $$id: "mergeAlert",
    target: local.selected,
    source: {
      "alert": true,
    },
  })
  local.payloadText = json.stringify({
    $$id: "stringify",
    value: result.payload,
  })
  result.roundtrip = json.parse({
    $$id: "parse",
    text: local.payloadText,
  })
}
