function (input) {
  var key = String(input.key || "")
  if (input.source !== undefined && input.source !== null &&
      Object.prototype.hasOwnProperty.call(input.source, key)) {
    return input.source[key]
  }
  var segments = key.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)
  var value = segments.reduce(function (current, part) {
    return current !== undefined && current !== null ? current[part] : undefined
  }, input.source)
  return value === undefined ? input.defaultValue : value
}
