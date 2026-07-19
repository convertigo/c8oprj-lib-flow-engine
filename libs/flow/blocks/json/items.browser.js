function (input) {
  var source = input.source !== undefined ? input.source : input.value
  var includeScalar = input.includeScalar === undefined ? true : Boolean(input.includeScalar)
  var path = input.path === undefined || input.path === null || input.path === "" ? "items" : String(input.path)
  var candidate = path.split(".").filter(Boolean).reduce(function (current, key) {
    return current !== undefined && current !== null ? current[key] : undefined
  }, source)
  var value = candidate !== undefined && candidate !== null ? candidate : source
  if (Array.isArray(value)) return value.filter(function (item) { return item !== undefined && item !== null })
  return includeScalar && value !== undefined && value !== null ? [value] : []
}
