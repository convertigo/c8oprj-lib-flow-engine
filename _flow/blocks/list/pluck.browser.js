function (input) {
  var items = Array.isArray(input.items) ? input.items : []
  var path = String(input.path || "")
  var segments = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)
  var skipMissing = input.skipMissing === undefined ? true : Boolean(input.skipMissing)
  return items.reduce(function (/** @type {any[]} */ out, /** @type {any} */ item) {
    var value = segments.reduce(function (/** @type {any} */ current, /** @type {string} */ key) {
      return current !== undefined && current !== null ? current[key] : undefined
    }, item)
    if (value !== undefined) out.push(value)
    else if (!skipMissing) out.push(input.defaultValue)
    return out
  }, [])
}
