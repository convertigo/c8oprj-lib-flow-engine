function (input) {
  // The limits, flags and syntax of lib/text-pattern.js (the backend), so that a pattern behaves alike on both sides. The
  // backend runs it under a budget of reads; a browser cannot stop its own RegExp, which only costs the page that runs it.
  function fail(code, message, status) { throw { code: code, message: "text.split: " + message, status: status } }
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
  var text = input.text === undefined || input.text === null ? "" : String(input.text)
  var separator = input.separator === undefined || input.separator === null ? "," : String(input.separator)
  var trim = !(input.trim === false || String(input.trim) === "false")
  var removeEmpty = !(input.removeEmpty === false || String(input.removeEmpty) === "false")
  var items
  if (input.regex === true || String(input.regex) === "true") {
    var flags = input.flags === undefined || input.flags === null ? "" : String(input.flags)
    items = text.split(regex(separator, flags.replace(/g/g, ""), text)).map(function (item) { return item === undefined ? "" : item })
  } else {
    if (text === "") return []
    items = separator === "" ? [text] : text.split(separator)
  }
  var list = []
  for (var i = 0; i < items.length; i++) {
    var item = trim ? items[i].trim() : items[i]
    if (!removeEmpty || item !== "") list.push(item)
  }
  return list
}
