(function () {
  return {
    displayName: function (node) {
      var props = node.props || node;
      return props.rows === undefined ? "rows" : flowSummary.text(props.rows);
    },
    // emit appends to the field of an enclosing forEachChunk with into: elsewhere it is an analysis error.
    analyze: function (ctx, node) {
      if (ctx.emitTargets > 0) return;
      ctx.errors.push({severity: "error", code: "EMIT_OUTSIDE_FOR_EACH_CHUNK", property: "rows",
        path: ctx.currentNodeInfo && ctx.currentNodeInfo.id || "", block: "emit",
        message: "emit needs an enclosing forEachChunk with into.", hint: "Set into on the forEachChunk, for example into: \"data\"."});
    }
  };
}())
