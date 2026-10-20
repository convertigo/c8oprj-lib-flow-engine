(function () {
 return {analyze:function(ctx,node) {
  var p=ctx.props(node),format=p.format;
  var schema=format===undefined||format==="timestamp"?{type:"number"}:format==="iso"?{type:"string"}:{type:"unknown",oneOf:[{type:"number"},{type:"string"}]};
  ctx.addSchema(ctx.outputPath(node),schema);
 }};
})()
