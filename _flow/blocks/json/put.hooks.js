(function () {
  return {analyze: function (ctx, node) {
    var props = ctx.props(node), schema = ctx.schemaForPath(props.path);
    ctx.checkValueType({type:"string"}, props.key, "key");
    ctx.checkValueType(schema && schema.additionalProperties && typeof schema.additionalProperties === "object" ? schema.additionalProperties : {type:"unknown"}, props.value, "value");
    ctx.addPath(props.path);
    ctx.addSchema(ctx.outputPath(node), schema);
  }};
}())
