function (input) {
  return JSON.stringify(input.value, null, input.pretty === true ? 2 : 0)
}
