const _meta = {
  sourceVersion: 2, version: 1, runtime: "rhino", icon: "mdi:book-plus",
  targets: ["backend", "frontend"], effects: ["state"],
  implementations: {backend: {runtime: "rhino"}, frontend: {runtime: "browser", file: "put.browser.js", capabilities: ["collections"]}},
  description: "Inserts or replaces one map value under a string key.",
  longDescription: "Choose the map using its named destination. Key and Value can be picked from the current scope. A map created with json.map validates every value before insertion; its value type does not change.",
  summary: "put {{key}} into {{path}}",
  tags: ["map", "dictionary", "put", "insert"],
  properties: {
    path: {label: "Map", kind: "path", mode: "write", targetType: "object", default: "local.entries", required: true},
    key: {label: "Key", kind: "value", type: "string", default: "key", required: true},
    value: {label: "Value", kind: "value", type: "unknown", default: ""}
  },
  outputs: {out: {type: "object", hidden: true}},
  hooks: {file: "put.hooks.js"}
};
(function () {
  return {run: function (ctx, node) {
    var props = ctx.props(node);
    return ctx.collections.put(props.path, ctx.template(props.key), ctx.input(props));
  }};
}())
