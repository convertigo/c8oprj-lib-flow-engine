function (input) {
  var source = input.source
  return source && typeof source === "object" ? Object.keys(source).map(function (key) { return source[key] }) : []
}
