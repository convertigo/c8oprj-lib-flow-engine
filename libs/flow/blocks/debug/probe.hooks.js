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
      if (props.out) {
        ctx.addPath(props.out);
        if (ctx.schemaForValue && ctx.addSchema) {
          ctx.addSchema(props.out, ctx.schemaForValue(props.value));
        }
      }
    }
  };
}())
