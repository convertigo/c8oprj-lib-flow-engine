function (input) {
  var prefix = String(input.errorPrefix || "JSON parse failed")
  try {
    return { ok: true, value: JSON.parse(String(input.text || "")), error: "" }
  } catch (error) {
    var suffix = input.truncated ? " because input was truncated" : ""
    return { ok: false, value: {}, error: prefix + suffix + ": " + String(error) }
  }
}
