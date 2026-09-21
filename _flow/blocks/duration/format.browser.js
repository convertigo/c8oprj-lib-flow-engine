function (input) {
  function pad(value, size) {
    var text = String(value)
    while (text.length < size) text = "0" + text
    return text
  }

  var total = Math.max(0, Number(input.milliseconds) || 0)
  var digits = Math.max(0, Math.min(3, Math.floor(Number(input.fractionDigits))))
  if (!isFinite(digits)) digits = 1
  var wholeSeconds = Math.floor(total / 1000)
  var hours = Math.floor(wholeSeconds / 3600)
  var minutes = Math.floor(wholeSeconds / 60) % 60
  var seconds = wholeSeconds % 60
  var value = (input.showHours || hours > 0 ? pad(hours, 2) + ":" : "")
    + pad(input.showHours || hours > 0 ? minutes : Math.floor(wholeSeconds / 60), 2)
    + ":" + pad(seconds, 2)
  if (digits > 0) {
    value += "." + pad(Math.floor(total % 1000), 3).substring(0, digits)
  }
  return value
}
