function (input) {
  var source = input.source
  var keys = source && typeof source === "object" ? Object.keys(source) : []
  var key = keys.length ? keys[0] : null
  return { key: key, value: key === null ? undefined : source[key] }
}
