(function () { return {analyze:function(ctx,node) {
  var p=ctx.props(node), out=ctx.outputPath(node), item=ctx.itemSchemaFor(p.rows);
  var schema={type:"array",items:{type:"any"}};
  if(item && item.type==="object") {
    var source=item.properties||{}, properties={};
    var path=typeof p.path==="string"?p.path.replace(/^\$\.?/,""):"";
    if(/^[A-Za-z_][A-Za-z_0-9.]*$/.test(path))ctx.withCurrentSchema(item,function(){schema.items=ctx.schemaForPath("current."+path)||{type:"any"};});
  }
  ctx.addSchema(out,schema);
} }; }())
