const _flow = { sourceVersion: 2, inputs: { csv: { type: "string", required: true } } }

function CsvStats({ input, result }) {
  local.lines = text.split({ text: input.csv, separator: "\\r?\\n", regex: true })
  local.headerFound = false
  local.dataCount = 0
  local.badLine = 0
  json.array({ path: "local.categories", itemType: { type: "object", properties: { category: { type: "string" }, count: { type: "integer" }, sum: { type: "number" }, min: { type: "number" }, max: { type: "number" } } } })
  forEach({
    items: local.lines,
    $$nodes() {
      local.lineNo = current.index + 1
      local.row = current.trim()
      if (local.row != "") {
        if (!local.headerFound) {
          local.fields = text.split({ text: local.row, separator: ";" })
          if (local.fields.length != 3 || local.fields[0].trim() != "category" || local.fields[1].trim() != "label" || local.fields[2].trim() != "amount") {
            throw { code: "BAD_CSV", message: "Invalid header", status: 400 }
          }
          local.headerFound = true
        } else {
          local.dataCount = local.dataCount + 1
          local.fields = text.split({ text: local.row, separator: ";" })
          local.category = local.fields[0].trim()
          local.label = local.fields[1].trim()
          local.amountText = local.fields[2].trim()
          if (local.fields.length != 3 || local.category == "" || local.label == "") {
            throw { code: "BAD_CSV", message: "Invalid fields", status: 400 }
          }
          local.matchResult = text.match({ text: local.amountText, pattern: "^[0-9]+(\\.[0-9]{1,2})?$" })
          local.validAmount = local.matchResult.matched
          if (!local.validAmount || !isFinite(Number(local.amountText))) {
            throw { code: "BAD_CSV", message: "Invalid amount", status: 400 }
          }
          if (local.dataCount > 200) {
            throw { code: "BAD_CSV", message: "Too many rows", status: 400 }
          }
          local.amount = Number(local.amountText)
          local.found = false
          forEach({
            items: local.categories,
            $$nodes() {
              if (current.category == local.category) {
                local.found = true
                current.count = current.count + 1
                current.sum = current.sum + local.amount
                current.min = min(current.min, local.amount)
                current.max = max(current.max, local.amount)
              }
            },
          })
          if (!local.found) {
            json.push({ path: "local.categories", value: { category: local.category, count: 1, sum: local.amount, min: local.amount, max: local.amount } })
          }
        }
      }
    },
  })
  if (!local.headerFound) {
    throw { code: "BAD_CSV", message: "Missing header", status: 400 }
  }
  result.categories = local.categories
  result.total = { count: 0, sum: 0, mean: 0, min: null, max: null }
}