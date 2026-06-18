const _meta = {
  "version": 1,
  "description": "Returns a normalized array from a JSON value, using source.items when present or the source value as one item.",
  "icon": "mdi:code-json",
  "properties": {
    "source": {
      "label": "Source",
      "kind": "expression",
      "type": "object",
      "default": "local.source",
      "description": "JSON value to normalize. If it has an items array, that array is used."
    },
    "path": {
      "label": "Items path",
      "kind": "text",
      "type": "string",
      "default": "items",
      "expert": true,
      "description": "Optional direct property path containing items. Defaults to items."
    },
    "includeScalar": {
      "label": "Include scalar",
      "kind": "expression",
      "type": "boolean",
      "default": true,
      "expert": true,
      "description": "When true, a non-array source becomes a single-item array."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "category": "Output",
      "default": "local.items",
      "description": "Scope path receiving the normalized item array."
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
  "tags": [
    "json",
    "items",
    "array",
    "normalize"
  ]
}

// Use Rhino 1.9.0 features: https://mozilla.github.io/rhino/compat/engines.html
(function () {
  function get(value, key) {
    if (value === undefined || value === null) {
      return undefined
    }
    if (value[key] !== undefined) {
      return value[key]
    }
    if (typeof value.get === "function") {
      return value.get(key)
    }
    return undefined
  }

  function isArrayLike(value) {
    if (!value || typeof value === "string") {
      return false
    }
    return value.length !== undefined || typeof value.size === "function" || typeof value.getLength === "function"
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
    if (typeof value.getLength === "function") {
      return Number(value.getLength()) || 0
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

  function plain(value) {
    if (value === undefined || value === null) {
      return value
    }
    return JSON.parse(JSON.stringify(value))
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

  function readPath(value, path) {
    var current = value
    var parts = String(path || "").split(".")
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i]
      if (!part) {
        continue
      }
      current = get(current, part)
      if (current === undefined || current === null) {
        return undefined
      }
    }
    return current
  }

  function pushArray(out, value) {
    var count = arrayLength(value)
    for (var i = 0; i < count; i++) {
      var item = itemAt(value, i)
      if (item !== undefined && item !== null) {
        out.push(plain(item))
      }
    }
  }

  return {
    run: function (ctx, node) {
      var props = ctx.props(node)
      var source = ctx.expr(props.source || props.value || props["in"])
      var includeScalar = bool(ctx, props.includeScalar, true)
      var path = props.path === undefined || props.path === null || props.path === "" ? "items" : String(props.path)
      var candidate = path ? readPath(source, path) : source
      var out = []
      if (candidate !== undefined && candidate !== null) {
        if (isArrayLike(candidate)) {
          pushArray(out, candidate)
          return out
        }
        if (includeScalar) {
          out.push(plain(candidate))
        }
        return out
      }
      if (isArrayLike(source)) {
        pushArray(out, source)
      } else if (includeScalar && source !== undefined && source !== null) {
        out.push(plain(source))
      }
      return out
    }
  }
}())
