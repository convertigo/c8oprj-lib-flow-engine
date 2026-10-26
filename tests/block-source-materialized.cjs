// A shared catalog keeps its placeholder after preparation; exports use the resolved block.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const service=vm.runInNewContext(fs.readFileSync('_flow/modules/block-source-service.js','utf8'));
const placeholder=Object.freeze({name:'row',__flowFormat:'flowscript-block',__blockDefinition:{runtime:'rhino'}});
const catalog=Object.freeze({row:placeholder});
const code='({run:function(){return {value:1};}})';
const resolved=Object.freeze({...placeholder,__rhinoCode:code,__flowCode:'const _meta={runtime:"rhino"};\n'+code});
const env={normalizeTree:x=>structuredClone(x),blockDescriptor:x=>x.__blockDefinition,blockImplementation:x=>({runtime:x.runtime}),sha256Hex:x=>'digest:'+x.length,raise:(code)=>{throw Error(code)}};
const out=service.getSource(catalog,'row',{detail:'full'},env,resolved);
assert.equal(out.implementationSource,code);
assert.equal(vm.runInNewContext(out.implementationSource).run().value,1);
assert.equal(catalog.row,placeholder);assert.equal(placeholder.__rhinoCode,undefined);
const mutable={row:resolved};assert.equal(service.getSource(mutable,'row',{detail:'full'},env).implementationSource,code);
assert.throws(()=>service.getSource(catalog,'missing',{detail:'full'},env),/UNKNOWN_BLOCK/);
console.log('PASS resolved source export with immutable and mutable catalogs');
