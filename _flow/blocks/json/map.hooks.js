(function () {
  return {analyze: function (ctx, node) {
    var props = ctx.props(node);
    ctx.declareSchema(props.path, {type: "object", additionalProperties: props.valueType});
    ctx.addSchema(ctx.outputPath(node), ctx.schemaForPath(props.path));
  }};
}())
