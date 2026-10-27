(function () {
  return {
    displayName: function (node) {
      var props = node.props || node;
      return props.source === undefined ? "source" : flowSummary.text(props.source);
    },
    analyze: function (ctx, node) {
      ctx.visitNodes(node.each || []);
      ctx.visitNodes(node.reduce || []);
    }
  };
}())
