(function () {
  return {
    displayName: function (node) {
      var items = flowSummary.prop(node, "items") || flowSummary.prop(node, "in") || "items";
      var path = flowSummary.prop(node, "path") || "field";
      return flowSummary.output(node, flowSummary.text(path + " from " + items));
    },

    analyze: function (ctx, node) {
      var props = ctx.props(node);
      ctx.addPath(props.out);
    }
  };
}())
