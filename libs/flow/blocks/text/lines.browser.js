function (input) {
  var trim = input.trim === undefined ? true : Boolean(input.trim)
  var skipEmpty = input.skipEmpty === undefined ? true : Boolean(input.skipEmpty)
  return String(input.text || input.value || input.source || "")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
    .map(function (line) { return trim ? line.trim() : line })
    .filter(function (line) { return !skipEmpty || line.length > 0 })
}
