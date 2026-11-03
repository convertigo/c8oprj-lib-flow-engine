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
  var frames=new Map(), serial=0, visits=new WeakMap();
  var participant=transport('flow',function(id,action,expression) {
   var f=frames.get(String(id));if(!f)throw new Error('Expired block frame');
   var roots={input:f.ctx.scopes.input,arguments:f.args || f.node.props || {},output:{value:f.output},local:f.ctx.scopes.local,result:f.ctx.scopes.result};
   if(action==='variables') {
    var bindings={};
    ['input','local','result','current','parent','chunk','acc','value','config'].forEach(function(name){
     var d=Object.getOwnPropertyDescriptor(f.ctx.scopes,name);if(!d)return;
     if(Object.prototype.hasOwnProperty.call(d,'value')) Object.defineProperty(bindings,'@'+name,{enumerable:true,value:d.value});
     else Object.defineProperty(bindings,'@'+name,{enumerable:true,get:function(){throw new Error('Lazy scope must not be forced for inspection');}});
    });
    var groups=[scope('Inputs',roots.input),scope(f.args ? 'Arguments' : 'Arguments (source)',roots.arguments),scope('Output',roots.output),scope('Local',roots.local),scope('Result',roots.result),scope('@',bindings)];if(f.error)groups.push(scope('Error',f.error));return JSON.stringify({scopes:groups});
   }
   if(!/^(input|arguments|output|local|result)(\.[A-Za-z_$][\w$]*)*$/.test(expression)) return JSON.stringify({result:'Use a scope path: input.*, arguments.*, output.*, local.* or result.*',evaluationError:true});
   var parts=expression.split('.'), value=roots[parts.shift()];
   parts.forEach(function(key){var d=value && Object.getOwnPropertyDescriptor(value,key);value=d && d.value;});
   return JSON.stringify({result:display(value)});
  });
  var paged=false;
  try { paged=participant && typeof participant.scope==='function'; } catch(olderTransport) { }
  function scope(name,value) {return paged ? JSON.parse(String(participant.scope(name,value))) : variables(name,value,display);}
  function enter(ctx,node) {
   var target=table.get(node); if(!target || !participant) return null;
   var id=String(++serial), frame={ctx:ctx,node:node,output:undefined};frames.set(id,frame);
   var visit=(visits.get(node)||0)+1;visits.set(node,visit);
   try {
    participant.enter(id,JSON.stringify(Object.assign({},target,{source:source,label:String(node.id || node.block)+(visit>1?' ['+visit+']':'')})));
   } catch(error) { participant.leave(id); frames.delete(id); throw error; }
   return {failed:function(error){
    var root=ctx;while(root.request && root.request.__parentRun)root=root.request.__parentRun;
    var seen=root.debugSeenErrors || (root.debugSeenErrors=new Set());if(seen.has(error))return;if(seen.size>=64)seen.clear();seen.add(error);
    function own(value,key){var d=value && Object.getOwnPropertyDescriptor(value,key);return d && d.value;}
    var value=own(error,'flowError') || own(error,'error') || error;
    frame.error={code:display(own(value,'code') || 'BLOCK_ERROR'),message:display(own(value,'message') || error)};participant.at(id,'error');
   },before:function(args){frame.args=args;participant.at(id,'before');},after:function(value){frame.output=value;participant.at(id,'after');},leave:function(){participant.leave(id);frames.delete(id);}};
  }
  function before(ctx,node){var activation=enter(ctx,node);if(activation)activation.before(null);return activation;}
  function run(ctx,node,call) {
   var activation=before(ctx,node);if(!activation)return call();
   try {var value=call();activation.after(value);return value;} finally {activation.leave();}
  }
  return {enter:enter,before:before,wrap:function(block) {
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
