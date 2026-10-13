function (input) {
  var text = input.text === undefined || input.text === null ? "" : String(input.text)
  var separator = input.separator === undefined || input.separator === null ? "," : String(input.separator)
  var trim = !(input.trim === false || String(input.trim) === "false")
  var removeEmpty = !(input.removeEmpty === false || String(input.removeEmpty) === "false")
  if (text === "") return []
  var items = separator === "" ? [text] : text.split(separator)
  var list = []
  for (var i = 0; i < items.length; i++) {
    var item = trim ? items[i].trim() : items[i]
    if (!removeEmpty || item !== "") list.push(item)
  }
  return list
}
