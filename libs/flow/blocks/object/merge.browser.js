function (input) {
  return Object.assign({}, input.target && typeof input.target === "object" ? input.target : {}, input.source && typeof input.source === "object" ? input.source : {})
}
