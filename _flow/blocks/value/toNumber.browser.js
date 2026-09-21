function (input) {
  var number = Number(input.value)
  var fallback = Number(input.fallback)
  return Number.isFinite(number) ? number : (Number.isFinite(fallback) ? fallback : 0)
}
