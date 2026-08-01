const _meta = {
  "version": 1,
  "icon": "mdi:plus",
  "description": "Adds two numbers.",
  "targets": ["backend", "frontend"],
  "effects": [],
  "implementations": {
    "backend": { "runtime": "rhino" },
    "frontend": { "runtime": "browser", "file": "add.browser.js" }
  },
  "properties": {
    "left": {
      "label": "Left",
      "kind": "value",
      "type": "number",
      "default": 0,
      "description": "First number."
    },
    "right": {
      "label": "Right",
      "kind": "value",
      "type": "number",
      "default": 0,
      "description": "Number to add."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "default": "local.sum",
      "description": "Path receiving the sum."
    }
  },
  "outputs": {
    "out": { "type": "number" }
  },
  "runtime": "rhino",
  "tags": ["number", "math", "add", "sum", "portable", "axiom"]
}

(function () {
  return {
    run: function (ctx, node) {
      var props = ctx.props(node)
      return Number(ctx.input({ value: props.left })) + Number(ctx.input({ value: props.right }))
    }
  }
}())
