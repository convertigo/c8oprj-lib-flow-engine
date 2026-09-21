function (input) {
  var value = input.value
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value)
  if (typeof value === "string") return /^(?:true|1|yes|on)$/i.test(value.trim())
  return false
}
