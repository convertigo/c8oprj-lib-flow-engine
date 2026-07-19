function (input) {
  var segments = String(input.path || "").replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)
  return segments.reduce(function (current, key) {
    return current !== undefined && current !== null ? current[key] : undefined
  }, input.source)
}
