const _meta = {
  "version": 1, "icon": "mdi:format-list-numbered", "description": "Returns the first item of an array or a fallback.",
  "targets": ["backend", "frontend"], "effects": [],
  "implementations": { "backend": { "runtime": "rhino" }, "frontend": { "runtime": "browser", "file": "first.browser.js" } },
  "properties": {
    "items": { "label": "Items", "kind": "expression", "type": "array", "default": "local.items", "description": "Source array." },
    "fallback": { "label": "Fallback", "kind": "value", "type": "unknown", "description": "Value returned for an empty array." },
    "out": { "label": "Output", "kind": "path", "mode": "write", "default": "local.item", "description": "Path receiving the item." }
  },
  "outputs": { "out": { "type": "unknown" } }, "runtime": "rhino", "hooks": { "file": "first.hooks.js" },
  "tags": ["list", "array", "first", "portable", "axiom"]
}
(function () { return { run: function (ctx, node) { var p = ctx.props(node); var items = ctx.expr(p.items) || []; return items.length ? items[0] : ctx.input({ value: p.fallback }) } } }())
