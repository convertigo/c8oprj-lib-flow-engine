// Loaded on the first selected block boundary; identities and frames belong to that invocation.
(function () {
 function preview(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return String(value).substring(0,500);
  return Array.isArray(value) ? '[Array]' : '[Object]';
 }
 function variables(name, value, display) {
  var rows=[];
  if (value && typeof value === 'object') Object.keys(value).slice(0,100).forEach(function (key) {
   var d=Object.getOwnPropertyDescriptor(value,key);
   rows.push({name:key,value:d && Object.prototype.hasOwnProperty.call(d,'value') ? display(d.value) : '<accessor>',expandable:false});
  });
  return {name:name,variables:rows};
 }
 function create(transport, table, source, display) {
  display=display || preview;
  var frames=new Map(), serial=0;
  var participant=transport('flow',function(id,action,expression) {
   var f=frames.get(String(id));if(!f)throw new Error('Expired block frame');
   var roots={input:f.ctx.scopes.input,arguments:f.node.props || {},output:{value:f.output},local:f.ctx.scopes.local,result:f.ctx.scopes.result};
   if(action==='variables') return JSON.stringify({scopes:[variables('Inputs',roots.input,display),variables('Arguments (source)',roots.arguments,display),variables('Output',roots.output,display),variables('Local',roots.local,display),variables('Result',roots.result,display)]});
   if(!/^(input|arguments|output|local|result)(\.[A-Za-z_$][\w$]*)*$/.test(expression)) return JSON.stringify({result:'Use a scope path: input.*, arguments.*, output.*, local.* or result.*',evaluationError:true});
   var parts=expression.split('.'), value=roots[parts.shift()];
   parts.forEach(function(key){var d=value && Object.getOwnPropertyDescriptor(value,key);value=d && d.value;});
   return JSON.stringify({result:display(value)});
  });
  function before(ctx,node) {
   var target=table.get(node); if(!target || !participant) return null;
   var id=String(++serial), frame={ctx:ctx,node:node,output:undefined};frames.set(id,frame);
   try {
    participant.enter(id,JSON.stringify(Object.assign({},target,{source:source,label:String(node.id || node.block)})));
    participant.at(id,'before');
   } catch(error) { participant.leave(id); frames.delete(id); throw error; }
   return {after:function(value){frame.output=value;participant.at(id,'after');},leave:function(){participant.leave(id);frames.delete(id);}};
  }
  function run(ctx,node,call) {
   var activation=before(ctx,node);if(!activation)return call();
   try {var value=call();activation.after(value);return value;} finally {activation.leave();}
  }
  return {before:before,wrap:function(block) {
   if(!block)return block;
   var adapter=Object.create(block);
   Object.defineProperty(adapter,'run',{value:function(ctx,node){return run(ctx,node,function(){return block.run(ctx,node);});}});
   if(typeof block.prepareNode==='function') Object.defineProperty(adapter,'prepareNode',{value:function(node,helpers){
    var runner=block.prepareNode(node,helpers);
    return runner ? function(ctx){return run(ctx,node,function(){return runner(ctx,node);});} : null;
   }});
   return adapter;
  }};
 }
 return {create:create};
}())
