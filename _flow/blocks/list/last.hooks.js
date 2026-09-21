(function () {
  return {
    displayName: function (node) {
      return flowSummary.output(node, flowSummary.text("last of " + (flowSummary.prop(node, "items") || "items")))
    },
    analyze: function (ctx, node) {
      var props = ctx.props(node)
      ctx.addPath(ctx.outputPath(node))
      ctx.addSchema(ctx.outputPath(node), ctx.itemSchemaFor(props.items))
    }
  }
}())
