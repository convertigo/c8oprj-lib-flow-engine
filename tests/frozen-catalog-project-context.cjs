const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../_flow/Engine.js','utf8');const a=source.indexOf('\tfunction readOnlyBlockCatalog(block)'),b=source.indexOf('\n\tfunction graphBlockStackLabel',a);let project='A',calls=0;
const read=vm.runInNewContext('('+source.slice(a,b).trim()+')',{blockCatalogContextKey:()=>project,flowExecutionSnapshotService:()=>({freeze:Object.freeze}),Object});
const block={catalog:()=>({project,counter:++calls})};Object.defineProperty(block,'__readOnlyCatalog',{value:Object.freeze({key:'A',value:Object.freeze({project:'A'})})});Object.freeze(block);
assert.equal(read(block).project,'A');project='B';assert.equal(read(block).project,'B');assert.equal(block.__readOnlyCatalog.key,'A');project='A';assert.equal(read(block).project,'A');assert.equal(calls,1);console.log('Frozen parent catalog survives a nested project context; child view is isolated.');
