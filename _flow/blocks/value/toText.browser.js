function (input) {
  var value = input.value
  return value === null || value === undefined ? String(input.fallback || "") : String(value)
}
