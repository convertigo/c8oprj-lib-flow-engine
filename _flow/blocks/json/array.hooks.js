(function () {
  return {analyze: function (ctx, node) {
    var props = ctx.propsWithDefaults ? ctx.propsWithDefaults(node) : ctx.props(node);
    ctx.declareSchema(props.path, {type: "array", items: props.itemType});
    ctx.addSchema(ctx.outputPath(node), ctx.schemaForPath(props.path));
  }};
}())
