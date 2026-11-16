const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const service=vm.runInNewContext(fs.readFileSync('_flow/modules/resource-service.js','utf8'));
let reads=0;
class File{static separator='/';constructor(base,p){this.path=path.posix.resolve(String(base),p||'');}toString(){return this.path;}getAbsolutePath(){return this.path;}isFile(){return true;}length(){return 4;}lastModified(){return 1;}}
const env={File,sourcePaths:{path:p=>'_flow/'+p},projectDir:()=>'/project',normalizeResourcePath:p=>p,isAllowedResourcePath:()=>true,canonicalPath:f=>String(f).replace('/_flow/resources/link','/_flow/engine.yaml'),FileUtils:{readFileToString(){reads++;return 'text';}},intOption:(_,v)=>v,resourceKind:()=>'',resourceName:()=>'',resourceMimeType:()=>'',resourceUri:()=>'',sha256Hex:()=>'',raise:code=>{throw Error(code);}};
for(const p of ['_flow/engine.yaml','_flow/lib/x.js','libs/src/a.java','_flow/resources/link','resources/../_flow/engine.yaml']) assert.throws(()=>service.get({path:p,assetOnly:true},env),/ASSET_PATH_NOT_ALLOWED/);
assert.equal(reads,0);
for(const p of ['_flow/resources/data.txt','resources/data.json'])assert.equal(service.get({path:p,assetOnly:true},env).content,'text');
assert.equal(service.get({path:'_flow/engine.yaml'},env).content,'text','author inspection retains its scope');
const blockSource=fs.readFileSync('_flow/blocks/asset/read.block.js','utf8');
const block=vm.runInNewContext(blockSource.slice(blockSource.indexOf('(function ()')));
for(const debug of [false,true]){let called=false;const ctx={props:()=>({path:'_flow/resources/data.txt'}),template:v=>v,assetRead:p=>{called=true;return p;},resourceGet:()=>{throw Error('generic source read');}};const result=debug?block.debug.run(ctx,{},block.debug.resolve(ctx,{})):block.run(ctx,{});assert(called);assert.equal(result,'_flow/resources/data.txt');}
console.log('boundary-asset-scope OK');
