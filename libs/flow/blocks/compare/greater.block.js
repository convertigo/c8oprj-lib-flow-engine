const _meta = {
  "version": 1, "icon": "mdi:greater-than", "description": "Tests whether the left JSON scalar is greater than the right scalar.",
  "targets": ["backend", "frontend"], "effects": [],
  "implementations": { "backend": { "runtime": "rhino" }, "frontend": { "runtime": "browser", "file": "greater.browser.js" } },
  "properties": {
    "left": { "label": "Left", "kind": "value", "type": "unknown", "description": "Left value." },
    "right": { "label": "Right", "kind": "value", "type": "unknown", "description": "Right value." },
    "out": { "label": "Output", "kind": "path", "mode": "write", "default": "local.greater", "description": "Path receiving the result." }
  },
  "outputs": { "out": { "type": "boolean" } }, "runtime": "rhino",
  "tags": ["compare", "greater", "boolean", "portable", "axiom"]
}
(function () { return { run: function (ctx, node) { var p = ctx.props(node); return ctx.input({ value: p.left }) > ctx.input({ value: p.right }) } } }())
