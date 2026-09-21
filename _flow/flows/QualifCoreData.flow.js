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
  object.pick({
    $$id: "pickFields",
    $$out: "local.selected",
    source: local.profile,
    keys: [
      "city",
      "metrics.temperature",
    ],
    out: "local.selected",
  })
  object.merge({
    $$id: "mergeAlert",
    $$out: "result.payload",
    target: local.selected,
    source: {
      "alert": true,
    },
    out: "result.payload",
  })
  json.stringify({
    $$id: "stringify",
    $$out: "local.payloadText",
    value: result.payload,
    out: "local.payloadText",
  })
  json.parse({
    $$id: "parse",
    $$out: "result.roundtrip",
    text: local.payloadText,
    out: "result.roundtrip",
  })
  return result
}
