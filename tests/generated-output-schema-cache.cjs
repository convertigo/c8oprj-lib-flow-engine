const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const cache=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../_flow/modules/flow-output-schema-cache.js'),'utf8'));
const storage=new Map(),stats={};let fingerprint='source+blocks+config+schemas+fragments+types',valid=true,builds=0,safe=true,error=false;
const env={identity:r=>({key:r.flowName,fingerprint}),read:k=>storage.get(k),write:(k,v)=>storage.set(k,v),count:k=>stats[k]=(stats[k]||0)+1,valid:()=>valid,capture(c,fn){c.safe=safe;return fn();}};
const request={flowName:'Rows',flowSource:'source',allowRequestableSchema:false,frontendSourceDrafts:{},sourceRemovals:{}};
const build=()=>{builds++;return {ok:!error,schema:{type:'object',properties:{value:{type:'string'}}}};};
const first=cache.run(request,env,build);first.schema.properties.value.type='mutated';
assert.equal(cache.run(request,env,build).schema.properties.value.type,'string');assert.equal(builds,1,'Unchanged native XSD requests must reuse a serialized result');
fingerprint='changed dependency';cache.run(request,env,build);assert.equal(builds,2);
valid=false;cache.run(request,env,build);assert.equal(builds,3,'A concurrent mutation refuses a hit');
assert.equal(stats.writes,2,'A concurrent mutation must not publish its result');valid=true;
safe=false;fingerprint='dynamic-flow-contract';cache.run(request,env,build);cache.run(request,env,build);assert.equal(builds,5,'Untracked dynamic/custom-hook dependencies stay uncached');
safe=true;error=true;fingerprint='failure';cache.run(request,env,build);cache.run(request,env,build);assert.equal(builds,7,'Errors are not cached');error=false;
for(const options of [{detail:'full'},{config:{}},{input:{}},{definition:{}},{allowRequestableSchema:true},{frontendSourceDrafts:{draft:'code'}},{sourceRemovals:{removed:true}},{unknownOption:true}]){
 const r={...request,...options};assert.equal(Boolean(cache.eligible(r)),false);const previous=builds;cache.run(r,env,build);assert.equal(builds,previous+1);
}
storage.set('Rows','broken JSON');fingerprint='source';assert.equal(cache.run(request,env,build).ok,true,'A damaged cache entry is rebuilt');
console.log('generated-output-schema-cache: reuse, owned snapshots, dependency changes, concurrent mutation, bypasses, errors and corrupt entries OK');
