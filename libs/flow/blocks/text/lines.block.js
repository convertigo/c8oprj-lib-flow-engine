const _meta = {
  "version": 1,
  "description": "Splits text into clean lines.",
  "icon": "mdi:format-list-text",
  "properties": {
    "text": {
      "label": "Text",
      "kind": "template",
      "type": "string",
      "default": "{{ local.text }}",
      "description": "Text to split. Scope paths such as local.execution.stdout are accepted."
    },
    "trim": {
      "label": "Trim lines",
      "kind": "expression",
      "type": "boolean",
      "default": true,
      "description": "Trim whitespace around each returned line."
    },
    "skipEmpty": {
      "label": "Skip empty lines",
      "kind": "expression",
      "type": "boolean",
      "default": true,
      "description": "Remove empty lines after optional trimming."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "category": "Output",
      "default": "local.lines",
      "description": "Scope path receiving the array of lines."
    }
  },
  "outputs": {
    "out": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "runtime": "rhino",
  "tags": [
    "text",
    "lines",
    "split",
    "stdout",
    "process"
  ]
}

// Use Rhino 1.9.0 features: https://mozilla.github.io/rhino/compat/engines.html
(function () {
  function bool(ctx, value, fallback) {
    if (value === undefined || value === null || value === "") {
      return fallback
    }
    if (typeof value === "boolean") {
      return value
    }
    var resolved = typeof value === "string" ? ctx.expr(value) : value
    if (typeof resolved === "boolean") {
      return resolved
    }
    var lowered = String(resolved || "").toLowerCase()
    return lowered === "true" || lowered === "1" || lowered === "yes"
  }

  function text(ctx, value) {
    if (value === undefined || value === null) {
      return ""
    }
    var rendered = String(ctx.template(value))
    if (rendered === "undefined" || rendered === "null") {
      return ""
    }
    if (/^(input|local|config|current|result)(?:\.|\[)/.test(rendered.trim())) {
      var evaluated = ctx.expr(rendered.trim())
      return evaluated === undefined || evaluated === null ? "" : String(evaluated)
    }
    return rendered
  }

  return {
    run: function (ctx, node) {
      var props = ctx.props(node)
      var source = text(ctx, props.text || props.value || props.source)
      var trim = bool(ctx, props.trim, true)
      var skipEmpty = bool(ctx, props.skipEmpty, true)
      var raw = String(source || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
      var lines = []
      for (var i = 0; i < raw.length; i++) {
        var line = trim ? raw[i].trim() : raw[i]
        if (skipEmpty && line.length === 0) {
          continue
        }
        lines.push(line)
      }
      return lines
    }
  }
}())
