const _meta = {
  "version": 1, "icon": "mdi:counter", "description": "Returns the number of items in an array.",
  "targets": ["backend", "frontend"], "effects": [],
  "implementations": { "backend": { "runtime": "rhino" }, "frontend": { "runtime": "browser", "file": "count.browser.js" } },
  "properties": {
    "items": { "label": "Items", "kind": "expression", "type": "array", "default": "local.items", "description": "Source array." },
    "out": { "label": "Output", "kind": "path", "mode": "write", "default": "local.count", "description": "Path receiving the count." }
  },
  "outputs": { "out": { "type": "integer" } }, "runtime": "rhino",
  "tags": ["list", "array", "count", "length", "portable", "axiom"]
}
(function () { return { run: function (ctx, node) { var items = ctx.expr(ctx.props(node).items) || []; return Number(items.length || 0) } } }())
