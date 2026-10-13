function (input) {
  var value = input.value
  if (value === undefined || value === null || value === "") return new Date().toISOString()
  var date = typeof value === "number" || /^-?\d+$/.test(String(value)) ? new Date(Number(value)) : new Date(String(value))
  return isNaN(date.getTime()) ? "" : date.toISOString()
}
