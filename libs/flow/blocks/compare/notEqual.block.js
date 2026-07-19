const _meta = {
  "version": 1, "icon": "mdi:not-equal-variant", "description": "Tests strict inequality between two JSON scalar values.",
  "targets": ["backend", "frontend"], "effects": [],
  "implementations": { "backend": { "runtime": "rhino" }, "frontend": { "runtime": "browser", "file": "notEqual.browser.js" } },
  "properties": {
    "left": { "label": "Left", "kind": "value", "type": "unknown", "description": "Left value." },
    "right": { "label": "Right", "kind": "value", "type": "unknown", "description": "Right value." },
    "out": { "label": "Output", "kind": "path", "mode": "write", "default": "local.notEqual", "description": "Path receiving the result." }
  },
  "outputs": { "out": { "type": "boolean" } }, "runtime": "rhino",
  "tags": ["compare", "not equal", "boolean", "portable", "axiom"]
}
(function () { return { run: function (ctx, node) { var p = ctx.props(node); return ctx.input({ value: p.left }) !== ctx.input({ value: p.right }) } } }())
