function (input) {
  var key = String(input.key || "")
  var segments = key.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)
  var value = segments.reduce(function (current, part) {
    return current !== undefined && current !== null ? current[part] : undefined
  }, input.source)
  return value === undefined ? input.defaultValue : value
}
