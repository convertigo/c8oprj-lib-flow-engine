function (input) {
  var items = Array.isArray(input.items) ? input.items : []
  var caseSensitive = Boolean(input.caseSensitive)
  var query = String(input.query || "").trim()
  var expected = caseSensitive ? query : query.toLowerCase()
  var limit = Math.max(0, Math.floor(Number(input.limit) || 0))
  function searchable(/** @type {any} */ value) {
    if (value === undefined || value === null) return ""
    if (typeof value === "object") {
      try { return JSON.stringify(value) } catch (_) { return String(value) }
    }
    return String(value)
  }
  return items.filter(function (/** @type {any} */ item) {
    var text = searchable(item)
    if (!caseSensitive) text = text.toLowerCase()
    return !expected || text.indexOf(expected) >= 0
  }).slice(0, limit || items.length)
}
