(function () {
  return {
    displayName: function (node) {
      var props = node.props || node;
      return props.condition === undefined ? "condition" : flowSummary.text(props.condition);
    },
    analyze: function (ctx, node) { ctx.visitNodes(node.nodes || []); }
  };
}())
