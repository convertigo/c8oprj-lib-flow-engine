const _meta = {
  "version": 1,
  "icon": "mdi:format-text",
  "description": "Trims leading and trailing whitespace from a scalar value.",
  "targets": ["backend", "frontend"],
  "effects": [],
  "implementations": {
    "backend": { "runtime": "rhino" },
    "frontend": { "runtime": "browser", "file": "trim.browser.js", "version": 1 }
  },
  "properties": {
    "text": {
      "label": "Text",
      "kind": "value",
      "type": "unknown",
      "default": "",
      "description": "Scalar value to convert to text and trim. Null and undefined become an empty string."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "default": "local.text",
      "description": "Scope path receiving the trimmed string."
    }
  },
  "outputs": {
    "out": { "type": "string" }
  },
  "runtime": "rhino",
  "tags": ["text", "trim", "portable", "axiom"]
}

(function () {
  return {
    run: function (ctx, node) {
      var props = ctx.props(node)
      var value = ctx.input({ value: props.text })
      return value === undefined || value === null ? "" : String(value).trim()
    }
  }
}())
