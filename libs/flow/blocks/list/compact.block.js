const _meta = {
  "version": 1,
  "description": "Builds a clean array from values by skipping null, undefined and empty strings, with optional one-level flattening.",
  "icon": "mdi:format-list-checks",
  "properties": {
    "items": {
      "label": "Items",
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "Array containing values to keep. Nested arrays can be flattened one level."
    },
    "flatten": {
      "label": "Flatten arrays",
      "kind": "expression",
      "type": "boolean",
      "default": true,
      "description": "When true, array values inside items are expanded into the output."
    },
    "skipEmptyString": {
      "label": "Skip empty strings",
      "kind": "expression",
      "type": "boolean",
      "default": true,
      "expert": true,
      "description": "When true, blank strings are omitted."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "category": "Output",
      "default": "local.items",
      "description": "Scope path receiving the compacted array."
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
  "runtime": "rhino",
  "hooks": {
    "file": "compact.hooks.js"
  },
  "tags": [
    "list",
    "array",
    "compact",
    "filter"
  ]
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

  function isBlank(value, skipEmptyString) {
    if (value === undefined || value === null) {
      return true
    }
    if (skipEmptyString && typeof value === "string") {
      var text = value.trim()
      return !text.length || text === "undefined" || text === "null"
    }
    return false
  }

  function addValue(out, value, flatten, skipEmptyString) {
    if (isBlank(value, skipEmptyString)) {
      return
    }
    if (flatten && isArrayLike(value)) {
      var count = arrayLength(value)
      for (var i = 0; i < count; i++) {
        addValue(out, itemAt(value, i), false, skipEmptyString)
      }
      return
    }
    out.push(value)
  }

  return {
    run: function (ctx, node) {
      var props = ctx.props(node)
      var items = ctx.expr(props.items || props["in"]) || []
      var flatten = bool(ctx, props.flatten, true)
      var skipEmptyString = bool(ctx, props.skipEmptyString, true)
      var out = []
      var count = arrayLength(items)
      for (var i = 0; i < count; i++) {
        addValue(out, itemAt(items, i), flatten, skipEmptyString)
      }
      return out
    }
  }
}())
