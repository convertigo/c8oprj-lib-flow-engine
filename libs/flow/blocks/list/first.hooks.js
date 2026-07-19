(function () {
  return {
    displayName: function (node) {
      return flowSummary.output(node, flowSummary.text("first of " + (flowSummary.prop(node, "items") || "items")))
    },
    analyze: function (ctx, node) {
      var props = ctx.props(node)
      ctx.addPath(props.out)
      ctx.addSchema(props.out, ctx.itemSchemaFor(props.items))
    }
  }
}())
