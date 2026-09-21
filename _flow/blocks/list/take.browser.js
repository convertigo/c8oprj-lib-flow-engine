function (input) {
  var items = Array.isArray(input.items) ? input.items : []
  var offset = Math.max(0, Number(input.offset) || 0)
  var count = input.count === undefined || input.count === null || input.count === ""
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, Number(input.count) || 0)
  return items.slice(offset, offset + count)
}
