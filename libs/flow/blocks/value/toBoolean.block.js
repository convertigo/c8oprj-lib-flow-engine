const _meta = {
  "version": 1,
  "icon": "mdi:toggle-switch-outline",
  "description": "Converts a JSON scalar to a boolean using stable text and number rules.",
  "targets": ["backend", "frontend"],
  "effects": [],
  "implementations": { "backend": { "runtime": "rhino" }, "frontend": { "runtime": "browser", "file": "toBoolean.browser.js" } },
  "properties": {
    "value": { "label": "Value", "kind": "value", "type": "unknown", "description": "JSON scalar to convert." },
    "out": { "label": "Output", "kind": "path", "mode": "write", "default": "local.boolean", "description": "Path receiving the boolean." }
  },
  "outputs": { "out": { "type": "boolean" } },
  "runtime": "rhino",
  "tags": ["value", "convert", "boolean", "portable", "axiom"]
}

(function () {
  function convert(value) {
    if (typeof value === "boolean") return value
    if (typeof value === "number") return value !== 0 && !isNaN(value)
    if (typeof value === "string") return /^(?:true|1|yes|on)$/i.test(value.trim())
    return false
  }
  return { run: function (ctx, node) { return convert(ctx.input({ value: ctx.props(node).value })) } }
}())
