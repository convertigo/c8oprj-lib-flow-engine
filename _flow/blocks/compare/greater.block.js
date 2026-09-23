const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:greater-than",
  "description": "Tests whether the left JSON scalar is greater than the right scalar.",
  "summary": "{{left}} greater than {{right}}",
  "targets": [
    "backend",
    "frontend",
  ],
  "effects": [],
  "implementations": {
    "backend": {
      "runtime": "rhino",
    },
    "frontend": {
      "runtime": "browser",
      "file": "greater.browser.js",
    },
  },
  "properties": {
    "left": {
      "label": "Left",
      "kind": "value",
      "type": "unknown",
      "description": "Scalar value tested as greater than the right operand.",
    },
    "right": {
      "label": "Right",
      "kind": "value",
      "type": "unknown",
      "description": "Scalar value used as the upper comparison operand.",
    },
  },
  "outputs": {
    "out": {
      "type": "boolean",
    },
  },
  "runtime": "rhino",
  "tags": [
    "compare",
    "greater",
    "boolean",
    "portable",
    "axiom",
  ],
}
(function () { return { run: function (ctx, node) { var p = ctx.props(node); return ctx.input({ value: p.left }) > ctx.input({ value: p.right }) } } }())
