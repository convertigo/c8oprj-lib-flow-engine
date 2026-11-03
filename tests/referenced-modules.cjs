const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../_flow/modules/flow-library-service.js'),'utf8');const service=vm.runInNewContext(source);
class File{constructor(parent,child){this.path=child?path.join(String(parent),child):String(parent);}isFile(){return this.path==='/refs/tool/_flow/lib/math.js' || this.path==='/project/lib/plain.js';}toString(){return this.path;}}
const env={File,safeFilePart:s=>s,referenceRoots:()=>['/refs/tool'],projectNameForRoot:()=> 'tool',sourcePaths:{path:s=>'_flow/'+s},projectLibDir:()=>'/project/lib',engineLibDir:()=>'/engine/lib',raise:code=>{throw Error(code);}};
assert.equal(String(service.libraryFile('tool.math',env)),'/refs/tool/_flow/lib/math.js');assert.equal(String(service.libraryFile('plain',env)),'/project/lib/plain.js');assert.throws(()=>service.libraryFile('tool.../secret',env),/UNKNOWN_LIBRARY/);assert.throws(()=>service.libraryFile('unreferenced.math',env),/UNKNOWN_LIBRARY/);
console.log('4 referenced module checks passed');
