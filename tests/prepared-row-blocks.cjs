const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../_flow');
const loadModule=n=>vm.runInNewContext(fs.readFileSync(path.join(root,'modules',n+'.js'),'utf8'));
const expressions=loadModule('expression-utils'),syntax=loadModule('template-syntax'),cache=loadModule('cache-utils'),scope=loadModule('scope-path-utils');
const env={templateSyntax:syntax,cacheUtils:cache,expressionTokenCache:cache.createBoundedMapState(64),expressionProgramCache:cache.createBoundedMapState(64),normalizeTree:v=>v,isScopePath:v=>/^(request|input|config|local|result|trace|current)(?:\.|$)/.test(v),isRuntimeHandle:()=>false,sanitizeRuntimeValue:v=>v,raise(code,message){throw Object.assign(new Error(message),{code});}};
function block(name){const source=fs.readFileSync(path.join(root,'blocks',name+'.block.js'),'utf8');return vm.runInNewContext(source.slice(source.indexOf('(function ()')));}
function context(props,input){const ctx={scopes:{input,local:{target:{}},result:{}},props:()=>props,readObjectPath:(o,p)=>scope.readObjectPath(o,p)};
 ctx.template=v=>expressions.renderTree(ctx,v,env);ctx.expr=v=>expressions.evaluate(ctx,v,env);ctx.input=p=>p.value===undefined?undefined:ctx.template(p.value);
 ctx.collections={put(p,k,v){if(typeof k!=='string'||!k||['__proto__','prototype','constructor'].includes(k))env.raise('INVALID_MAP_KEY','invalid map key');ctx.scopes.local.target[k]=v;return ctx.scopes.local.target;}};
 return ctx;
}
function prepared(name,props){const api=block(name);let compiles=0;const helpers={props,compileValue(v){compiles++;return expressions.compileTemplate(v,env);},compileExpression(v){compiles++;return expressions.compile(v,env);}};
 return {api,run:api.prepareNode({},helpers),compiles:()=>compiles};}
function equal(a,b){assert.equal(JSON.stringify(a),JSON.stringify(b));}
{
 const props={value:{label:'${input.name}',values:['${input.count}']},pretty:true},p=prepared('json/stringify',props);
 for(let i=0;i<100;i++){const ctx=context(props,{name:'row '+i,count:i});equal(p.run(ctx),p.api.run(ctx,{}));}
 assert.equal(p.compiles(),1);
}
{
 const props={path:'local.target',key:'${input.key}',value:{name:'${input.name}'}},p=prepared('json/put',props);
 for(let i=0;i<100;i++){const input={key:'k'+i,name:'row '+i};equal(p.run(context(props,input)),p.api.run(context(props,input),{}));}
 assert.equal(p.compiles(),2);
 for(const key of ['__proto__',2,''])assert.throws(()=>p.run(context(props,{key})),{code:'INVALID_MAP_KEY'});
}
for(const key of ['${input.key}','a.b','x-y','missing']){
 const props={source:'input.object',key,defaultValue:{fallback:'${input.name}'}},p=prepared('object/get',props);
 for(let i=0;i<20;i++){const input={object:{'a.b':'literal',a:{b:'nested'},'x-y':i},key:'x-y',name:'fallback '+i};equal(p.run(context(props,input)),p.api.run(context(props,input),{}));}
}
{
 const props={source:'input.object',key:'found',defaultValue:'${missing(input.name)}'},p=prepared('object/get',props);
 assert.equal(p.run(context(props,{object:{found:42}})),42,'A default is evaluated only when missing');
 assert.throws(()=>p.run(context(props,{object:{}})),{code:'INVALID_EXPRESSION'});
}
for(const dynamic of [false,true]){
 const props={text:'${input.text}',pattern:dynamic?'${input.pattern}':'^(a+)(b)?$',ignoreCase:dynamic?'${input.ignoreCase}':true},p=prepared('text/match',props);
 for(const input of [{text:'AaB',pattern:'^(a+)(b)?$',ignoreCase:true},{text:'aa',pattern:'^a+$',ignoreCase:false},{text:null,pattern:'.*',ignoreCase:false},{text:'no',pattern:'^a+$',ignoreCase:'true'}])equal(p.run(context(props,input)),p.api.run(context(props,input),{}));
 assert.equal(p.compiles(),3);
}
console.log('prepared-row-blocks: dynamic values, owned containers, lazy defaults, literal/dotted keys, regex groups/flags and map-key refusals OK');
