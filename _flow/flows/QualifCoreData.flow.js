// c8o: Flow source (FlowScript, sourceVersion 2). Calls are Flow blocks; plain keys are business properties, $$ keys are engine attributes and slots.
// c8o: Edit in the Studio or with the Flow MCP code tools; patch with the returned revision.

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
