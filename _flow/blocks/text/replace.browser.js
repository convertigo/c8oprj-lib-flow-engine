function (input) {
  // The limits, flags and syntax of lib/text-pattern.js (the backend), so that a pattern behaves alike on both sides. The
  // backend runs it under a budget of reads; a browser cannot stop its own RegExp, which only costs the page that runs it.
  function fail(code, message, status) { throw { code: code, message: "text.replace: " + message, status: status } }
  function regex(pattern, flags, text) {
    if (pattern.length > 500) fail("TEXT_PATTERN_INVALID", "The pattern is longer than 500 characters.", 400)
    if (!/^(?!.*(.).*\1)[gims]*$/.test(flags)) fail("TEXT_PATTERN_INVALID", "The flags of a pattern are letters among g, i, m and s, each written once; y, u, d and v are not supported.", 400)
    for (var i = 0; i < pattern.length; i++) {
      var c = pattern.charAt(i), next = pattern.charAt(i + 1)
      if (c === "\\") {
        if (/[A-Za-z]/.test(next) && "dDwWsSbBtnrfv0xuck".indexOf(next) < 0 || next === "u" && pattern.charAt(i + 2) === "{") fail("TEXT_PATTERN_INVALID", "The escape at position " + i + " of the pattern is not supported.", 400)
        i++
      } else if (c === "(" && next === "?" && !/^\(\?(?:[:=!]|<[=!]|<[A-Za-z][A-Za-z0-9]*>)/.test(pattern.substring(i))) {
        fail("TEXT_PATTERN_INVALID", "The group at position " + i + " of the pattern is not supported.", 400)
      }
    }
    if (text.length > 100000) fail("TEXT_INPUT_TOO_LONG", "The text is longer than 100000 characters for a pattern.", 413)
    try { return new RegExp(pattern, flags) } catch (e) { fail("TEXT_PATTERN_INVALID", "The pattern is not valid.", 400) }
  }
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
  var all = booleanValue(input.all, true)
  var caseSensitive = booleanValue(input.caseSensitive, true)
  if (input.regex === true || String(input.regex) === "true") {
    var flags = input.flags === undefined || input.flags === null ? "" : String(input.flags)
    if (flags.indexOf("g") >= 0) all = true
    flags = flags.replace(/g/g, "")
    if (!caseSensitive && flags.indexOf("i") < 0) flags += "i"
    return text.replace(regex(search, flags + (all ? "g" : ""), text), replacement)
  }
  if (search === "") return text

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
