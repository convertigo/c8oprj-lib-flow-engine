const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../_flow');
const load=n=>vm.runInNewContext(fs.readFileSync(path.join(root,'modules',n+'.js'),'utf8'));
const values=load('expression-utils'),syntax=load('template-syntax'),cache=load('cache-utils');
let parses=0;const wrapped=Object.assign({},syntax,{parts(v){parses++;return syntax.parts(v);},exactExpression(v){parses++;return syntax.exactExpression(v);}});
const env={templateSyntax:wrapped,cacheUtils:cache,expressionTokenCache:cache.createBoundedMapState(32),expressionProgramCache:cache.createBoundedMapState(32),normalizeTree:v=>v,isScopePath:v=>/^(request|input|config|local|result|trace|current)(?:\.|$)/.test(v),isRuntimeHandle:()=>false,runtimeHandleSummary:v=>v,sanitizeRuntimeValue:v=>v,raise(c,m){throw Object.assign(new Error(m),{code:c});}};
const ctx={scopes:{input:{name:'One'},local:{},result:{}}};
assert.equal(values.renderValue('${input.name}',ctx,env),'One');const first=parses;
for(let i=0;i<1000;i++){ctx.scopes.input={name:String(i)};assert.equal(values.renderValue('${input.name}',ctx,env),String(i));}
assert.equal(parses,first,'The same notation must not be parsed once per row/cell');
const compiled=values.compileTemplate({item:'${ { name: input.name } }',label:'Hello ${input.name}'},env);
const one=compiled(ctx);one.item.name='mutated';assert.equal(compiled(ctx).item.name,'999','Structured results remain owned by each invocation');
assert.equal(values.renderValue('cost \\${input.name}',ctx,env),'cost ${input.name}');
assert.equal(values.renderValue('legacy {{ input.name }}',ctx,env),'legacy 999');
assert.equal(values.renderValue('${input.name',ctx,env),'${input.name');
const count=parses;for(let i=0;i<1000;i++)assert.equal(values.renderValue('literal text',ctx,env),'literal text');assert.equal(parses,count);
assert.throws(()=>values.renderValue('${missing(input.name)}',ctx,env),{code:'INVALID_EXPRESSION'});
cache.clearBoundedMap(env.expressionProgramCache);values.renderValue('${input.name}',ctx,env);assert(parses>count,'Explicit cache invalidation must recompile the notation');
console.log('value-program-preparation: parse budget, fresh values/containers, escapes, legacy, invalidation and diagnostics OK');
