const _meta = {
  "version": 1,
  "icon": "mdi:format-text",
  "description": "Converts a JSON scalar to text. Null and undefined use the fallback.",
  "targets": ["backend", "frontend"],
  "effects": [],
  "implementations": { "backend": { "runtime": "rhino" }, "frontend": { "runtime": "browser", "file": "toText.browser.js" } },
  "properties": {
    "value": { "label": "Value", "kind": "value", "type": "unknown", "description": "JSON scalar to convert." },
    "fallback": { "label": "Fallback", "kind": "value", "type": "string", "default": "", "description": "Text returned for null or undefined." },
    "out": { "label": "Output", "kind": "path", "mode": "write", "default": "local.text", "description": "Path receiving the text." }
  },
  "outputs": { "out": { "type": "string" } },
  "runtime": "rhino",
  "tags": ["value", "convert", "text", "portable", "axiom"]
}

(function () {
  return { run: function (ctx, node) {
    var props = ctx.props(node)
    var value = ctx.input({ value: props.value })
    return value === null || value === undefined ? String(ctx.input({ value: props.fallback }) || "") : String(value)
  } }
}())
