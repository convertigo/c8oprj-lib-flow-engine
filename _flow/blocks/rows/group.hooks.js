(function () { return {analyze:function(ctx,node) {
  var p=ctx.props(node), out=ctx.outputPath(node), item=ctx.itemSchemaFor(p.rows);
  var schema={type:"array",items:{type:"object"}};
  if(item && item.type==="object") {
    var source=item.properties||{}, properties={};
    Object.keys(source).forEach(function(k){Object.defineProperty(properties,k,{value:source[k],enumerable:true,configurable:true});});
    if(Array.isArray(p.aggregations))p.aggregations.forEach(function(a){if(!a||typeof a.key!=="string")return;var value=a.type==="count"?{type:"integer"}:a.type==="sum"||a.type==="avg"?{type:"number"}:source[a.column]||{type:"any"};Object.defineProperty(properties,a.key,{value:value,enumerable:true,configurable:true});});
    schema.items={type:"object",properties:properties};
  }
  ctx.addSchema(out,schema);
} }; }())
