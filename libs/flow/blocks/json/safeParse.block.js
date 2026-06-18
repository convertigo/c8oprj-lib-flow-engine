const _meta = {
  "version": 1,
  "description": "Parses JSON text without throwing and returns a structured parse result.",
  "icon": "mdi:code-json",
  "properties": {
    "text": {
      "label": "JSON text",
      "kind": "template",
      "type": "string",
      "description": "JSON text to parse."
    },
    "errorPrefix": {
      "label": "Error prefix",
      "kind": "template",
      "type": "string",
      "default": "JSON parse failed",
      "description": "Prefix used in the returned error message."
    },
    "truncated": {
      "label": "Truncated",
      "kind": "expression",
      "type": "boolean",
      "default": false,
      "expert": true,
      "description": "Adds a truncation hint to the error message when parsing fails."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "category": "Output",
      "default": "local.parsed",
      "description": "Scope path receiving { ok, value, error }."
    }
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean"
        },
        "value": {
          "type": "unknown"
        },
        "error": {
          "type": "string"
        }
      }
    }
  },
  "runtime": "rhino",
  "tags": [
    "json",
    "parse",
    "safe"
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

  function plain(value) {
    if (value === undefined || value === null) {
      return value
    }
    return JSON.parse(JSON.stringify(value))
  }

  return {
    run: function (ctx, node) {
      var props = ctx.props(node)
      var text = String(ctx.template(props.text || ""))
      var prefix = String(ctx.template(props.errorPrefix || "JSON parse failed"))
      try {
        return { ok: true, value: plain(JSON.parse(text)), error: "" }
      } catch (error) {
        var suffix = bool(ctx, props.truncated, false) ? " because input was truncated" : ""
        return { ok: false, value: {}, error: prefix + suffix + ": " + String(error) }
      }
    }
  }
}())
