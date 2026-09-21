function (input) {
  function booleanValue(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback
    if (typeof value === "boolean") return value
    var lowered = String(value).toLowerCase()
    if (lowered === "false" || lowered === "0" || lowered === "no") return false
    return lowered === "true" || lowered === "1" || lowered === "yes"
  }

  var text = input.text === undefined || input.text === null ? "" : String(input.text)
  var search = input.search === undefined || input.search === null ? "" : String(input.search)
  var replacement = input.replacement === undefined || input.replacement === null ? "" : String(input.replacement)
  if (search === "") return text

  var all = booleanValue(input.all, true)
  var caseSensitive = booleanValue(input.caseSensitive, true)
  var haystack = caseSensitive ? text : text.toLowerCase()
  var needle = caseSensitive ? search : search.toLowerCase()
  var start = 0
  var match = haystack.indexOf(needle, start)
  if (match < 0) return text

  var result = ""
  while (match >= 0) {
    result += text.substring(start, match) + replacement
    start = match + search.length
    if (!all) break
    match = haystack.indexOf(needle, start)
  }
  return result + text.substring(start)
}
