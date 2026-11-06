const _flow = { sourceVersion: 2 }
function Capture() {
  // http.get({ out: "local.comment" }) stays a comment.
  http.get({ url: "https://example.invalid", out: "local.response" })
  list.first({ items: [1, 2], out: "local.first" })
  proof.business({ out: "business value" })
  list.first({ items: [3], $$out: "local.already" })
  list.first({ items: [{ out: "data value" }], $$out: "local.data" })
  list.first({ items: ["out: text", "http.get({ out: 'local.text' })"], $$out: "local.text" })
}
