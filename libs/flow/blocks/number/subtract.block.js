const _meta = {
  "version": 1,
  "icon": "mdi:minus",
  "description": "Subtracts one number from another.",
  "targets": ["backend", "frontend"],
  "effects": [],
  "implementations": {
    "backend": { "runtime": "rhino" },
    "frontend": { "runtime": "browser", "file": "subtract.browser.js" }
  },
  "properties": {
    "left": {
      "label": "Left",
      "kind": "value",
      "type": "number",
      "default": 0,
      "description": "Number to subtract from."
    },
    "right": {
      "label": "Right",
      "kind": "value",
      "type": "number",
      "default": 0,
      "description": "Number to subtract."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "default": "local.difference",
      "description": "Path receiving the difference."
    }
  },
  "outputs": {
    "out": { "type": "number" }
  },
  "runtime": "rhino",
  "tags": ["number", "math", "subtract", "difference", "portable", "axiom"]
}

(function () {
  return {
    run: function (ctx, node) {
      var props = ctx.props(node)
      return Number(ctx.input({ value: props.left })) - Number(ctx.input({ value: props.right }))
    }
  }
}())
