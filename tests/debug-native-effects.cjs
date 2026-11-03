// Native contracts must keep resolver ordering, deferred work, receivers and error translation.
const {parity,context,load,normalized}=require('./debug-native-arguments.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function implementation(name,globals={}){const s=fs.readFileSync(path.join(__dirname,'../_flow/blocks',name+'.block.js'),'utf8');return vm.runInNewContext(s.slice(s.indexOf('(function () {')),{...globals});}
for(const name of ['flow/analyze','flow/apply','flow/context','flow/outputSchema','flow/tree','flow/list','flow/schema/reset','flow/run','flow/test','requestable/list','requestable/schema','authoring/menu'])parity(name,{name:'fixture',flowSource:'literal source',input:{n:42},includeTrace:false});
parity('authoring/action',{name:'fixture',actionId:'start',action:{id:'start'}});
parity('fragment/use',{}, {}, {children:[{id:'child'}]});
parity('requestable/caller',{});
for(const items of [[],[0,null,'',42,['x']],null]){
 parity('list/compact',{items:'$items',flatten:true,skipEmptyString:true},{$items:items});
 parity('list/pluck',{items:'$items',path:'n',skipMissing:false,defaultValue:'$default'},{$items:items,$default:42});
 parity('list/search',{items:'$items',query:'$query',limit:2},{$items:items,$query:'x'});
 parity('json/items',{source:'$items',includeScalar:true},{$items:items});
}
for(const value of [null,42,{n:42},'fixture'])parity('yaml/parse',{text:'$v'},{$v:value});
parity('duration/format',{milliseconds:'$ms',showHours:'$hours',fractionDigits:'$digits'},{$ms:12345,$hours:false,$digits:2});
for(const name of ['email/mock','email/send','password/hash','password/verify','jwt/sign','jwt/verify','jwt/decode','ldap/authenticate','ldap/bind','ldap/search','ldap/escape','template/freemarker']){
 const props={};for(const key of ['text','body','to','subject','html','from','replyTo','cc','bcc','host','user','password','hash','salt','token','secret','url','login','base','filter','file','locale','value','claims','attributes','values'])props[key]='$'+key;
 const bindings=Object.fromEntries(Object.keys(props).map(k=>['$'+k,k+'-fixture']));
 parity(name,props,bindings);
 // Deliberately keep state in a shared receiver and make method lookup observable.
 for(const failure of ['none','load','resolve','invoke']){
  const impl=implementation(name);let saved;
  function make(){const ctx=context({...bindings}),events=ctx.events;const receiver={calls:0};
   ctx.lib=function(lib){events.push(['lib',lib]);if(failure==='load')throw {code:'FIXTURE',message:'fixture',email:true,ldap:true,freemarker:true};return new Proxy(receiver,{get(target,key){if(key==='calls')return target[key];events.push(['method',key]);return function(arg){assert.equal(this.calls,0,'same receiver');this.calls++;events.push(['invoke',key,normalized(arg)]);if(failure==='invoke')throw {code:'FIXTURE',message:'fixture',email:true,ldap:true,freemarker:true};return {text:'preview',calls:this.calls};};}});};
   if(failure==='resolve'){ctx.template=function(){events.push(['resolver-error']);throw {code:'FIXTURE',message:'fixture',email:true,ldap:true,freemarker:true};};ctx.input=ctx.template;}
   ctx.throwFlow=function(e){events.push(['translated',e]);throw e;};return {ctx,receiver};}
  const a=make(),b=make(),node={props};let ra,rb,ea,eb;
  try{ra=impl.run(a.ctx,node);}catch(e){ea=e;}
  try{saved=impl.debug.resolve(b.ctx,node);assert.equal(b.receiver.calls,0,'no library action before pause');rb=impl.debug.run(b.ctx,node,saved);}catch(e){eb=e;}
  assert.deepEqual(normalized(eb),normalized(ea),name+' '+failure+' errors');
  assert.deepEqual(normalized(rb),normalized(ra),name+' '+failure+' result');
  assert.deepEqual(normalized(b.ctx.events),normalized(a.ctx.events),name+' '+failure+' order/receiver');
 }
}
// Overrides change config only during the child slot and restore the original object on failure.
for(const fail of [false,true]){
 const impl=implementation('config/use'),old={a:1,nested:{kept:2}},ctx=context({$v:42});ctx.scopes.config=old;
 ctx.runNodes=()=>{assert.equal(ctx.scopes.config.nested.kept,2);assert.equal(ctx.scopes.config.nested.added,42);if(fail)throw Error('child');return 42;};
 const node={props:{overrides:{nested:{added:'$v'}}},then:[]},args=impl.debug.resolve(ctx,node);
 assert.equal(ctx.scopes.config,old);let error;try{assert.equal(impl.debug.run(ctx,node,args),42);}catch(e){error=e;}
 assert.equal(!!error,fail);assert.equal(ctx.scopes.config,old);assert.equal(old.nested.added,undefined);
}
const iso=implementation('date/iso'),node={props:{value:'$date'}},ctx=context({$date:0});const args=iso.debug.resolve(ctx,node);assert.equal(iso.debug.run(ctx,node,args),'1970-01-01T00:00:00.000Z');assert.equal(ctx.events.filter(e=>e[0]==='resolve').length,1);
console.log('Native effect contracts: pure collections, literal tooling, shared library receivers, failures and config restoration passed.');
