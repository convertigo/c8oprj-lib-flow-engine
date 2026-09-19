(function () {
  return {
    displayName: function (node) {
      var label = flowSummary.prop(node, "label");
      var value = flowSummary.prop(node, "value");
      var text = label || value || "value";
      return flowSummary.output(node, flowSummary.text(text));
    },

    analyze: function (ctx, node) {
      var props = ctx.props(node);
      if (ctx.outputPath(node)) {
        ctx.addPath(ctx.outputPath(node));
        if (ctx.schemaForValue && ctx.addSchema) {
          ctx.addSchema(ctx.outputPath(node), ctx.schemaForValue(props.value));
        }
      }
    }
  };
}())
