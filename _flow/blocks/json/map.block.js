const _meta = {
  sourceVersion: 2, version: 1, runtime: "rhino", icon: "mdi:book-alphabet",
  targets: ["backend", "frontend"], effects: ["state"],
  implementations: {backend: {runtime: "rhino"}, frontend: {runtime: "browser", file: "map.browser.js", capabilities: ["collections"]}},
  description: "Creates an empty map with string keys and a declared value type.",
  longDescription: "Describe the value stored under each key. Use json.put to insert or replace a key, which may come from a picker expression. The destination itself stays a static name.",
  summary: "create map {{path}}",
  tags: ["map", "dictionary", "create", "typed"],
  properties: {
    path: {label: "Output", kind: "path", mode: "write", declares: "out", default: "local.entries", required: true},
    valueType: {label: "Value type", kind: "schema", type: "object", default: {type: "string"}, required: true}
  },
  outputs: {out: {type: "object", additionalProperties: {"x-flow-schema-from": "valueType"}, hidden: true}},
  hooks: {file: "map.hooks.js"}
};
(function () {
  return {run: function (ctx, node) {
    var props = ctx.props(node);
    return ctx.collections.declare(props.path, {type: "object", additionalProperties: props.valueType}, {});
  }};
}())
