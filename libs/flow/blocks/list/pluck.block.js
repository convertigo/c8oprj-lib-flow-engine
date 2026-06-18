const _meta = {
  "version": 1,
  "icon": "mdi:format-list-bulleted-type",
  "description": "Extracts one field from each item of an array.",
  "longDescription": "Use this when you need names, ids or another field from an array of objects. It is the low-code equivalent of items.map(item => item.path).",
  "properties": {
    "items": {
      "label": "Input array",
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "Array to read from, for example local.pods.items."
    },
    "path": {
      "label": "Item path",
      "kind": "selector",
      "type": "string",
      "mode": "read",
      "sourceProperty": "items",
      "default": "name",
      "description": "Field path to read in each item. Supports nested paths and indexes, for example metadata.name or ports[0].port."
    },
    "skipMissing": {
      "label": "Skip missing",
      "kind": "expression",
      "type": "boolean",
      "default": true,
      "description": "When true, items where the path is missing are omitted."
    },
    "defaultValue": {
      "label": "Default value",
      "kind": "value",
      "type": "unknown",
      "expert": true,
      "description": "Value used when the item path is missing and skipMissing is false."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "category": "Output",
      "default": "local.values",
      "description": "Scope path receiving extracted values."
    }
  },
  "outputs": {
    "out": {
      "type": "array",
      "items": {
        "type": "unknown"
      }
    }
  },
  "tags": [
    "list",
    "array",
    "pluck",
    "field",
    "extract",
    "map"
  ],
  "runtime": "rhino",
  "hooks": {
    "file": "pluck.hooks.js"
  }
}

// Use Rhino 1.9.0 features: https://mozilla.github.io/rhino/compat/engines.html
(function () {
  function isArrayLike(value) {
    if (!value || typeof value === "string") {
      return false
    }
    return value.length !== undefined || typeof value.size === "function"
  }

  function arrayLength(value) {
    if (!isArrayLike(value)) {
      return 0
    }
    if (typeof value.length === "function") {
      return Number(value.length()) || 0
    }
    if (value.length !== undefined) {
      return Number(value.length) || 0
    }
    return Number(value.size()) || 0
  }

  function itemAt(value, index) {
    if (value[index] !== undefined) {
      return value[index]
    }
    if (typeof value.get === "function") {
      return value.get(index)
    }
    return undefined
  }

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

  return {
    run: function (ctx, node) {
      var props = ctx.props(node)
      var items = ctx.expr(props.items || props["in"]) || []
      var path = String(ctx.template(props.path || ""))
      var skipMissing = bool(ctx, props.skipMissing, true)
      var hasDefault = props.defaultValue !== undefined
      var defaultValue = hasDefault ? ctx.input({ value: props.defaultValue }) : null
      var out = []
      var count = arrayLength(items)
      for (var i = 0; i < count; i++) {
        var value = path ? ctx.readObjectPath(itemAt(items, i), path) : itemAt(items, i)
        if (value === undefined || value === null) {
          if (!skipMissing) {
            out.push(hasDefault ? defaultValue : null)
          }
        } else {
          out.push(value)
        }
      }
      return out
    }
  }
}())
