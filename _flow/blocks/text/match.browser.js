function (input) {
  var text = input.text === undefined || input.text === null ? "" : String(input.text)
  var ignoreCase = input.ignoreCase === true || String(input.ignoreCase) === "true"
  var found = new RegExp(input.pattern === undefined || input.pattern === null ? "" : String(input.pattern), ignoreCase ? "i" : "").exec(text)
  if (found === null) return { matched: false, groups: [] }
  var groups = []
  for (var i = 0; i < found.length; i++) groups.push(found[i] === undefined || found[i] === null ? "" : String(found[i]))
  return { matched: true, groups: groups }
}
