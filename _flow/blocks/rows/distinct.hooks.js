(function () { return {analyze:function(ctx,node) {
  var p=ctx.props(node), out=ctx.outputPath(node), item=ctx.itemSchemaFor(p.rows);
  ctx.addSameSchema(out,p.rows);
} }; }())
