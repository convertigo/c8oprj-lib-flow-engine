(function () { return {analyze:function(ctx,node) {
  var p=ctx.props(node), out=ctx.outputPath(node), item=ctx.itemSchemaFor(p.rows);
  var schema={type:"array",items:{type:"object"}};
  if(item && item.type==="object") {
    var source=item.properties||{}, properties={};
    var columns=Array.isArray(p.columns)?p.columns:null;
    if(columns){(Array.isArray(p.firstColumns)?p.firstColumns:[]).concat(columns).forEach(function(k){if(typeof k!=="string")return;var to=p.rename&&p.rename[k]||k;if(source[k])Object.defineProperty(properties,to,{value:source[k],enumerable:true});});schema.items={type:"object",properties:properties};}
    else if(p.columns===undefined&&(!p.rename||Object.keys(p.rename).length===0))schema.items=item;
  }
  ctx.addSchema(out,schema);
} }; }())
