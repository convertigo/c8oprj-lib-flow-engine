const _meta = {
  sourceVersion: 2, version: 1, runtime: "rhino", icon: "mdi:format-list-bulleted",
  targets: ["backend", "frontend"], effects: ["state"],
  implementations: {backend: {runtime: "rhino"}, frontend: {runtime: "browser", file: "array.browser.js", capabilities: ["collections"]}},
  description: "Creates an empty array with a declared item type.",
  longDescription: "Choose a destination and describe one item's type. The array's shape is known even before any item is added. Use json.push to append values; incompatible values are rejected.",
  summary: "create array {{path}}",
  tags: ["array", "list", "create", "typed"],
  properties: {
    path: {label: "Output", kind: "path", mode: "write", declares: "out", default: "local.items", required: true},
    itemType: {label: "Item type", kind: "schema", type: "object", default: {type: "string"}, required: true}
  },
  outputs: {out: {type: "array", items: {"x-flow-schema-from": "itemType"}, hidden: true}},
  hooks: {file: "array.hooks.js"}
};
(function () {
  return {run: function (ctx, node) {
    var props = ctx.props(node);
    return ctx.collections.declare(props.path, {type: "array", items: props.itemType}, []);
  }};
}())
