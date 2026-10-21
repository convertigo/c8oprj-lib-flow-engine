(function () { return {analyze:function(ctx,node) {
  var p=ctx.props(node), out=ctx.outputPath(node), item=ctx.itemSchemaFor(p.rows);
  var schema={type:"array",items:{type:"object"}};
  if(item && item.type==="object") {
    var source=item.properties||{}, properties={};
    Object.keys(source).forEach(function(k){Object.defineProperty(properties,k,{value:source[k],enumerable:true,configurable:true});});
    if(Array.isArray(p.aggregations))p.aggregations.forEach(function(a){if(!a||typeof a.key!=="string")return;var from=Object.prototype.hasOwnProperty.call(source,a.column)?source[a.column]:{type:"any"};if(p.valueKey&&from.properties&&Object.prototype.hasOwnProperty.call(from.properties,p.valueKey))from=from.properties[p.valueKey];var value=a.type==="count"?{type:"integer"}:a.type==="sum"||a.type==="avg"?{type:"number"}:from;Object.defineProperty(properties,a.key,{value:value,enumerable:true,configurable:true});});
    schema.items={type:"object",properties:properties};
  }
  ctx.addSchema(out,schema);
} }; }())
