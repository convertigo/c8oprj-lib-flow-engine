// Execute native debug contracts through the real Rhino runtime, with a test-only boundary transport.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir=String(engineDir),files=Packages.org.apache.commons.io.FileUtils;
var project=java.nio.file.Files.createTempDirectory('debug-native-').toFile(),__flowProjectDir=String(project);
function read(path){return String(files.readFileToString(new java.io.File(engineDir,path),'UTF-8'));}
var seen=[],checks=0;
function check(value,message){checks++;if(!value)throw new Error(message);}
function __nativeBoundary(ctx,node){var frame={block:node.block,id:node.id};seen.push(frame);return {before:function(args){check(args!==null,node.block+' must provide a native contract');frame.args=args;},after:function(value){frame.value=value;},failed:function(e){frame.error=e;},leave:function(){}};}
var original=read('Engine.js'),ordinary=eval(original);
// Change only the transport supplied to the runtime in this test, never the product's capabilities.
var selected=eval(original.replace(/blockDebugSignal: blockDebugSignal/g,'blockDebugSignal: {active:true}').replace(/beforeDebugBlock: beforeDebugBlock/g,'beforeDebugBlock: __nativeBoundary'));
function execute(engine,nodes,input){return JSON.parse(engine.run(JSON.stringify({definition:{version:1,nodes:nodes},input:input||{},includeTrace:true})));}
function parity(nodes,input,reset,allowError){if(reset)reset();var a=execute(ordinary,nodes,input);if(reset)reset();seen=[];var b=execute(selected,nodes,input);check(a.ok===b.ok,'same status');if(!allowError)check(b.ok,'debug succeeds: '+JSON.stringify(b.error||{}));check(JSON.stringify(a.result,function(k,v){return /^(elapsedMs|waitedMs|date)$/.test(k)?'<clock>':v;})===JSON.stringify(b.result,function(k,v){return /^(elapsedMs|waitedMs|date)$/.test(k)?'<clock>':v;}),'same result for '+nodes[0].block+': '+JSON.stringify(b.error||{}));check(!a.error||a.error.code===b.error.code,'same error');check(seen.length>0,'instrumented execution');return b;}
function one(name,props){return [{id:'it',block:name,props:props||{},out:'result.value'}];}
try{
 for(var name of ['crypto.hash','crypto.hmac','crypto.equals']){
  var props=name==='crypto.equals'?{value:'${input.value}',expected:'abc'}:{text:'${input.value}',secret:'fixture'};
  parity(one(name,props),{value:'abc'});check(seen[0].args[name==='crypto.equals'?'value':'text']==='abc','resolved crypto input');
 }
 for(var invalid of [{block:'crypto.hash',props:{text:'abc',algorithm:'invalid'}},{block:'crypto.hmac',props:{text:'abc',secret:''}},{block:'crypto.random',props:{bytes:1}},{block:'crypto.serverKey',props:{purpose:''}}])parity(one(invalid.block,invalid.props),{},null,true);
 seen=[];var random=execute(selected,one('crypto.random',{bytes:16,encoding:'hex'}));check(random.ok&&/^[0-9a-f]{32}$/.test(random.result.value),'real random after capture');check(seen[0].args.bytes===16,'random size captured');
 parity(one('ldap.sid',{sid:'AQIAAAAAAAUgAAAAIAIAAA==',relativeId:'7'}));
 for(var block of ['list.filter','list.map','list.sort']){
  var p={items:'input.items',where:'current.n > 1',select:'current.n',by:'current.n',direction:'desc'};
  var answer=parity(one(block,p),{items:[{n:3},{n:1},{n:2}]});check(answer.ok,'list debug succeeds '+block);
  var key=block==='list.filter'?'where':block==='list.map'?'select':'by';check(typeof seen[0].args[key]!=='object','per-item expression consumed, not eagerly evaluated');
 }
 parity([{block:'json.object',id:'object',out:'result.value',fields:[{block:'json.field',id:'field',props:{key:'${local.key}'},nodes:[{block:'set',id:'key',props:{path:'local.key',value:'after'}},{block:'return',id:'value',props:{value:42}}]}]}]);
 check(seen.some(function(f){return f.block==='json.field'&&f.args.key==='after';}),'field key resolved after child');
 parity(one('debug.probe',{value:'input.n',label:'probe'}),{n:42});
 parity(one('flow.wait',{delayMs:0}));
 var polled=parity([{block:'flow.poll',id:'poll',out:'result.value',props:{intervalMs:10,timeoutMs:1000,maxAttempts:3,until:'local.n===2'},nodes:[{block:'set',id:'next',props:{path:'local.n',value:'{{(local.n||0)+1}}'}}]}]);check(polled.ok&&polled.result.value.attempts===2,'poll twice');
 parity([{block:'forEachChunk',id:'chunks',out:'result.value',props:{source:'input.items',size:2,maxChunks:10,parallel:1,onError:'stop',ordered:false,into:'rows'},each:[{block:'emit',id:'emit',props:{rows:'chunk.rows'}}]}],{items:[1,2,3]});
 var output=new java.io.File(project,'lines.txt');
 var write=[{id:'writer',block:'file.withWriter',props:{path:String(output),as:'local.writer'},nodes:[{id:'write',block:'file.write',props:{value:'${input.text}',newline:true}}]},{id:'read',block:'file.readText',out:'result.text',props:{path:String(output)}}];
 parity(write,{text:'fixture'},function(){output.delete();});check(seen.some(function(f){return f.block==='file.write'&&f.args.value==='fixture';}),'file content captured once');
 parity([{id:'reader',block:'file.withReader',props:{path:String(output),as:'local.reader'},nodes:[{id:'line',block:'file.readLine',out:'result.line',props:{reader:'local.reader'}}]}]);
 parity([{id:'reader',block:'file.withReader',props:{path:String(output),as:'local.reader'},nodes:[{id:'each',block:'file.forEachLine',out:'result.count',props:{reader:'local.reader'},nodes:[{id:'remember',block:'set',props:{path:'result.last',value:'current'}}]}]}]);
 var changed=new java.io.File(project,'changed.txt');parity(one('file.writeIfChanged',{path:String(changed),content:'${input.text}',dryRun:false}),{text:'new'},function(){changed.delete();});
 var toml=new java.io.File(project,'settings.toml');parity(one('toml.ensureSection',{path:String(toml),section:'fixture',values:{n:42},dryRun:false}),{},function(){toml.delete();});
 var server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress('127.0.0.1',0),0),calls=0;
 server.createContext('/',new com.sun.net.httpserver.HttpHandler({handle:function(exchange){calls++;var request=String(new java.lang.String(exchange.getRequestBody().readAllBytes(),'UTF-8'));var bytes=new java.lang.String(JSON.stringify({method:String(exchange.getRequestMethod()),body:request,auth:String(exchange.getRequestHeaders().getFirst('Authorization')||'')})).getBytes('UTF-8');exchange.getResponseHeaders().add('Content-Type','application/json');exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();}}));server.start();
 try{var base='http://127.0.0.1:'+server.getAddress().getPort()+'/';for(var verb of ['get','post','put','delete']){var reply=parity(one('http.'+verb,{url:base,body:'input.body',headers:{'Content-Type':'application/x-www-form-urlencoded'},username:'fixture',password:'fixture'}),{body:{n:42}});check(reply.ok,'http '+verb);check(seen.some(function(f){return f.block==='http.request'&&f.args.url===base;}),'resolved transport URL');}check(calls===8,'exactly one I/O per normal/debug request');}finally{server.stop(0);}
 for(var mutation of ['config/mutate','schema/adopt']){
  var text=read('blocks/'+mutation+'.block.js'),impl=eval(text.substring(text.indexOf('(function () {'))),count=0,ctx={props:function(){return {dryRun:'fixture'};},literal:function(v){return v;},template:function(){count++;return false;},configMutate:function(args){return args;},schemaAdopt:function(args){return args;}};
  impl.run(ctx,{});check(count===1,'ordinary dryRun once');count=0;var captured=impl.debug.resolve(ctx,{});impl.debug.run(ctx,{},captured);check(count===1,'debug dryRun once');
 }
 print('Native Rhino execution: '+checks+' checks passed (real HTTP, files, crypto, loops and deferred values).');
}finally{files.deleteDirectory(project);}
