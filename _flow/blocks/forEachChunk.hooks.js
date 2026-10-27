(function () {
  return {
    displayName: function (node) {
      var props = node.props || node;
      return props.source === undefined ? "source" : flowSummary.text(props.source);
    },
    analyze: function (ctx, node) {
      var props = ctx.props(node);
      var emits = props.into !== undefined && props.into !== null && props.into !== "" ? 1 : 0;
      ctx.emitTargets = (ctx.emitTargets || 0) + emits;
      try {
        ctx.visitNodes(node.each || []);
        ctx.visitNodes(node.reduce || []);
      } finally {
        ctx.emitTargets -= emits;
      }
    }
  };
}())
