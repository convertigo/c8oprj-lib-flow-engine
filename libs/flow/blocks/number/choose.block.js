const _meta = {
  "version": 1,
  "icon": "mdi:call-split",
  "description": "Chooses one of two numbers from a boolean condition.",
  "targets": ["backend", "frontend"],
  "effects": [],
  "implementations": {
    "backend": { "runtime": "rhino" },
    "frontend": { "runtime": "browser", "file": "choose.browser.js" }
  },
  "properties": {
    "condition": {
      "label": "Condition",
      "kind": "value",
      "type": "boolean",
      "default": false,
      "description": "Selects the true value when enabled."
    },
    "whenTrue": {
      "label": "When true",
      "kind": "value",
      "type": "number",
      "default": 0,
      "description": "Number returned when the condition is true."
    },
    "whenFalse": {
      "label": "When false",
      "kind": "value",
      "type": "number",
      "default": 0,
      "description": "Number returned when the condition is false."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "default": "local.number",
      "description": "Path receiving the selected number."
    }
  },
  "outputs": {
    "out": { "type": "number" }
  },
  "runtime": "rhino",
  "tags": ["number", "condition", "choose", "select", "portable", "axiom"]
}

(function () {
  return {
    run: function (ctx, node) {
      var props = ctx.props(node)
      return ctx.input({ value: props.condition })
        ? Number(ctx.input({ value: props.whenTrue }))
        : Number(ctx.input({ value: props.whenFalse }))
    }
  }
}())
