const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
class File {constructor(p,c){this.p=path.resolve(String(p),c||'');}isAbsolute(){return path.isAbsolute(this.p);}getCanonicalFile(){return new File(this.p.replace('/_private/flow-data/link','/_flow'));}getAbsolutePath(){return this.p;}toString(){return this.p;}isFile(){return true;}}
// preserve the distinction between relative and absolute Java File constructors
class JavaFile extends File {constructor(p,c){super(p,c);this.absolute=c!==undefined||path.isAbsolute(String(p));}isAbsolute(){return this.absolute;}}
const ctx={read:()=>'/project',template:v=>v,raise:code=>{throw Error(code);},requireAuthoring:()=>{throw Error('AUTHORING_FORBIDDEN');}};
const file=' _flow/lib/file-access.js'.trim();
// Old readers resolve paths directly; prove that the old readText resolver accepts the external path.
let resolve;
if(fs.existsSync(file))resolve=vm.runInNewContext(fs.readFileSync(file,'utf8'),{Packages:{'java.io.File':JavaFile},flowEngineClass:()=>JavaFile}).resolve;
else {const source=fs.readFileSync('_flow/blocks/file/readText.block.js','utf8');const begin=source.indexOf('\tfunction resolveFile('),end=source.indexOf('\n\treturn {',begin);resolve=vm.runInNewContext(source.slice(begin,end)+'\nresolveFile',{File:JavaFile});}
for(const p of ['/etc/passwd','_flow/engine.yaml','../other/file','_private/flow-data/link/secret'])assert.throws(()=>resolve(ctx,p),/FILE_PATH_NOT_ALLOWED/);
assert.equal(String(resolve(ctx,'_private/flow-data/a.txt')),'/project/_private/flow-data/a.txt');
assert.throws(()=>resolve(ctx,'/etc/passwd',true),/AUTHORING_FORBIDDEN/);
ctx.requireAuthoring=()=>({kind:'admin'});assert.equal(String(resolve(ctx,'/trusted/export.csv',true)),'/trusted/export.csv');
for(const name of ['file/readText','file/withReader','file/withWriter','csv/parse'])assert(fs.readFileSync('_flow/blocks/'+name+'.block.js','utf8').includes('file-access'),'every file producer uses the policy');
console.log('boundary-file-paths OK');
