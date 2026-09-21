function (input) {
  var value = input.text
  return value === undefined || value === null ? "" : String(value).trim()
}
