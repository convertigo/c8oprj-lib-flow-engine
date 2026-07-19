function (input) {
  var source = input.source && typeof input.source === "object" ? input.source : {}
  var fields = Array.isArray(input.keys) ? input.keys : String(input.keys || "").split(/[\n,]/)
  return fields.map(function (/** @type {any} */ field) { return String(field).trim() }).filter(Boolean).reduce(function (/** @type {Record<string, any>} */ out, /** @type {string} */ path) {
    var value = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).reduce(function (/** @type {any} */ current, /** @type {string} */ key) {
      return current !== undefined && current !== null ? current[key] : undefined
    }, source)
    if (value !== undefined) out[path.split(".").pop()] = value
    return out
  }, {})
}
