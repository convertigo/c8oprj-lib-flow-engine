const _meta = {
  runtime: "rhino",
  properties: { out: { kind: "value", type: "string" } },
  outputs: { out: { type: "string" } }
};
(function () {
  return { run: function (ctx, node) { return ctx.props(node).out; } };
}())
