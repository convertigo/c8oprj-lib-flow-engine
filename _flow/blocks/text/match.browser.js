function (input) {
  // The limits, flags and syntax of lib/text-pattern.js (the backend), so that a pattern behaves alike on both sides. The
  // backend runs it under a budget of reads; a browser cannot stop its own RegExp, which only costs the page that runs it.
  function fail(code, message, status) { throw { code: code, message: "text.match: " + message, status: status } }
  function regex(pattern, flags) {
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
    try { return new RegExp(pattern, flags) } catch (e) { fail("TEXT_PATTERN_INVALID", "The pattern is not valid.", 400) }
  }
  var text = input.text === undefined || input.text === null ? "" : String(input.text)
  var flags = input.flags === undefined || input.flags === null ? "" : String(input.flags)
  if ((input.ignoreCase === true || String(input.ignoreCase) === "true") && flags.indexOf("i") < 0) flags += "i"
  var pattern = regex(input.pattern === undefined || input.pattern === null ? "" : String(input.pattern), flags)
  if (text.length > 100000) fail("TEXT_INPUT_TOO_LONG", "The text is longer than 100000 characters for a pattern.", 413)
  if (pattern.global) {
    var all = text.match(pattern) || []
    return { matched: all.length > 0, groups: all.map(String) }
  }
  var found = pattern.exec(text)
  if (found === null) return { matched: false, groups: [] }
  var groups = []
  for (var i = 0; i < found.length; i++) groups.push(found[i] === undefined || found[i] === null ? "" : String(found[i]))
  return { matched: true, groups: groups }
}
