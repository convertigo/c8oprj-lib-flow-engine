function (input) {
  var items = Array.isArray(input.items) ? input.items : []
  var flatten = input.flatten === undefined ? true : Boolean(input.flatten)
  var skipEmpty = input.skipEmptyString === undefined ? true : Boolean(input.skipEmptyString)
  /** @type {any[]} */
  var out = []
  /** @param {any} value */
  function add(value) {
    if (value === undefined || value === null || (skipEmpty && typeof value === "string" && value.trim() === "")) return
    if (flatten && Array.isArray(value)) value.forEach(add)
    else out.push(value)
  }
  items.forEach(add)
  return out
}
