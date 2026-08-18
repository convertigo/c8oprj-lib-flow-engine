const _meta = {
  "version": 1, "icon": "mdi:less-than", "description": "Tests whether the left JSON scalar is less than the right scalar.",
  "targets": ["backend", "frontend"], "effects": [],
  "implementations": { "backend": { "runtime": "rhino" }, "frontend": { "runtime": "browser", "file": "less.browser.js" } },
  "properties": {
    "left": { "label": "Left", "kind": "value", "type": "unknown", "description": "Scalar value tested as less than the right operand." },
    "right": { "label": "Right", "kind": "value", "type": "unknown", "description": "Scalar value used as the lower comparison operand." },
    "out": { "label": "Output", "kind": "path", "mode": "write", "default": "local.less", "description": "Path receiving the result." }
  },
  "outputs": { "out": { "type": "boolean" } }, "runtime": "rhino",
  "tags": ["compare", "less", "boolean", "portable", "axiom"]
}
(function () { return { run: function (ctx, node) { var p = ctx.props(node); return ctx.input({ value: p.left }) < ctx.input({ value: p.right }) } } }())
