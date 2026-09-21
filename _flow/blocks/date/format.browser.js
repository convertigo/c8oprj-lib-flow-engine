function (input) {
  var date = input.value instanceof Date ? input.value : new Date(input.value)
  if (isNaN(date.getTime())) {
    return String(input.fallback || "")
  }
  return date.toLocaleString(input.locale || undefined, input.options || {})
}
