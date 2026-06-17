const _meta = {
  "version": 1,
  "description": "Keeps array items whose text representation contains a query, with optional limit.",
  "icon": "mdi:text-search",
  "properties": {
    "items": {
      "label": "Input array",
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "Array to search. Objects are recursively converted to searchable text."
    },
    "query": {
      "label": "Query",
      "kind": "template",
      "type": "string",
      "description": "Case-insensitive text query. Empty keeps all items."
    },
    "limit": {
      "label": "Limit",
      "kind": "expression",
      "type": "integer",
      "description": "Maximum number of matching items. Empty or 0 keeps all matches."
    },
    "caseSensitive": {
      "label": "Case sensitive",
      "kind": "expression",
      "type": "boolean",
      "default": false,
      "expert": true,
      "description": "When true, query matching keeps case."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "category": "Output",
      "default": "local.items",
      "description": "Scope path receiving matching items."
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
    "search",
    "filter",
    "text"
  ],
  "runtime": "rhino"
}

// Use Rhino 1.9.0 features: https://mozilla.github.io/rhino/compat/engines.html
(function () {
  function isJavaMap(value) {
    try {
      return value instanceof java.util.Map
    } catch (e) {
      return false
    }
  }

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

  function searchableText(value, seen) {
    if (value === undefined || value === null) {
      return ""
    }
    if (typeof value !== "object") {
      return String(value)
    }
    if (!seen) {
      seen = []
    }
    if (seen.indexOf(value) !== -1) {
      return ""
    }
    seen.push(value)

    var out = []
    if (isJavaMap(value)) {
      var iterator = value.entrySet().iterator()
      while (iterator.hasNext()) {
        var entry = iterator.next()
        out.push(searchableText(entry.getKey(), seen))
        out.push(searchableText(entry.getValue(), seen))
      }
      return out.join(" ")
    }

    if (isArrayLike(value)) {
      var count = arrayLength(value)
      for (var i = 0; i < count; i++) {
        out.push(searchableText(itemAt(value, i), seen))
      }
      return out.join(" ")
    }

    Object.keys(value).forEach(function (key) {
      out.push(String(key))
      out.push(searchableText(value[key], seen))
    })
    return out.join(" ")
  }

  function text(ctx, value) {
    if (value === undefined || value === null) {
      return ""
    }
    return String(ctx.template(value))
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

  function integer(ctx, value, fallback) {
    if (value === undefined || value === null || value === "") {
      return fallback
    }
    var resolved = typeof value === "string" ? ctx.expr(value) : value
    var number = Number(resolved)
    return isNaN(number) ? fallback : Math.max(0, Math.floor(number))
  }

  return {
    run: function (ctx, node) {
      var props = ctx.props(node)
      var items = ctx.expr(props.items || props["in"]) || []
      var query = text(ctx, props.query).trim()
      var caseSensitive = bool(ctx, props.caseSensitive, false)
      var max = integer(ctx, props.limit, 0)
      var expected = caseSensitive ? query : query.toLowerCase()
      var out = []

      var count = arrayLength(items)
      for (var i = 0; i < count; i++) {
        var item = itemAt(items, i)
        var haystack = searchableText(item)
        if (!caseSensitive) {
          haystack = haystack.toLowerCase()
        }
        if (!expected || haystack.indexOf(expected) >= 0) {
          out.push(item)
          if (max > 0 && out.length >= max) {
            break
          }
        }
      }
      return out
    }
  }
}())
