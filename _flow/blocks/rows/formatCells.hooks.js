(function () { return {analyze:function(ctx,node) {
  var p=ctx.props(node), out=ctx.outputPath(node), item=ctx.itemSchemaFor(p.rows);
  var schema={type:"array",items:{type:"object"}};
  if(p.profile==="table") {
    schema.items={type:"object",additionalProperties:{type:"object",properties:{displayName:{type:"string"},type:{type:"string"},value:{type:"any"},displayValue:{type:"string"},hidden:{type:"boolean"}}}};
    if(p.includeFields===true)schema={type:"object",properties:{rows:schema,fields:{type:"object"}}};
    ctx.addSchema(out,schema);return;
  }
  if(item && item.type==="object") {
    var source=item.properties||{}, properties={};
    if(Array.isArray(p.columns)) {
      (Array.isArray(p.keepColumns)?p.keepColumns:[]).forEach(function(k){if(Object.prototype.hasOwnProperty.call(source,k))Object.defineProperty(properties,k,{value:source[k],enumerable:true});});
      p.columns.forEach(function(c){if(typeof c==="string")c={name:c};if(!c||typeof c.name!=="string")return;
        var value=Object.prototype.hasOwnProperty.call(source,c.name)?source[c.name]:{type:"any"}, cell=p.valuesOnly===true?value:{type:"object",properties:{value:value,text:{type:"string"}}};
        if(p.includeNumeric===true&&p.valuesOnly!==true)cell.properties.numeric={type:"boolean"};
        Object.defineProperty(properties,c.key===undefined?c.name:c.key,{value:cell,enumerable:true});
      });schema.items={type:"object",properties:properties};
    }
  }
  ctx.addSchema(out,schema);
} }; }())
