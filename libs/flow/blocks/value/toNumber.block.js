const _meta = {
  "version": 1,
  "icon": "mdi:numeric",
  "description": "Converts a JSON scalar to a finite number, using a fallback when conversion fails.",
  "targets": ["backend", "frontend"],
  "effects": [],
  "implementations": { "backend": { "runtime": "rhino" }, "frontend": { "runtime": "browser", "file": "toNumber.browser.js" } },
  "properties": {
    "value": { "label": "Value", "kind": "value", "type": "unknown", "description": "JSON scalar to convert." },
    "fallback": { "label": "Fallback", "kind": "value", "type": "number", "default": 0, "description": "Number returned when conversion fails." },
    "out": { "label": "Output", "kind": "path", "mode": "write", "default": "local.number", "description": "Path receiving the number." }
  },
  "outputs": { "out": { "type": "number" } },
  "runtime": "rhino",
  "tags": ["value", "convert", "number", "portable", "axiom"]
}

(function () {
  return { run: function (ctx, node) {
    var props = ctx.props(node)
    var number = Number(ctx.input({ value: props.value }))
    var fallback = Number(ctx.input({ value: props.fallback }))
    return isFinite(number) ? number : (isFinite(fallback) ? fallback : 0)
  } }
}())
