function (input) {
  return JSON.parse(String(input.text === undefined || input.text === null ? "" : input.text))
}
