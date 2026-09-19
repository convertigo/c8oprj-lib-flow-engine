'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const service=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../libs/flow/modules/catalog-service.js'),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
const block={name:'proof.item',props:{id:{type:'number'},disabled:{type:'boolean'}},slots:[{name:'then'}],icon:'mdi:variable'};
function fixture() {
  let icons=0, budgetKey;
  const env={blockCatalog:clone,blockNamespace:()=> 'proof',blockLocalName:()=> 'item',
    resolveBlockIcon:(_block,descriptor)=>{icons++;descriptor.iconFile='materialized';},
    normalizeTree:clone,listFlowLibraries:()=>[],loadTypes:()=>({}),schemaSummary:()=>({}),projectDir:()=>null,
    sha256Hex:value=>crypto.createHash('sha256').update(value).digest('hex'),
    responseBudget:(_options,{key})=>{budgetKey=key;return {enabled:false};}};
  return {env,get icons(){return icons;},get budgetKey(){return budgetKey;}};
}
test('catalog contract reads skip display asset resolution in every detail mode without losing properties or slots',()=>{
  for(const detail of ['full','compact','summary','signature']) {
    const f=fixture(), options={detail,includeTypes:true,doc:false,hints:false};
    const without=clone(service.catalogDefinition({item:block},{...options,includeIcons:false},f.env));
    assert.equal(f.icons,0,detail); const noIconsKey=f.budgetKey;
    const normal=clone(service.catalogDefinition({item:block},options,f.env));
    assert.ok(f.icons>0,detail); assert.notEqual(f.budgetKey,noIconsKey,'Cursor identity includes payload mode');
    for(const item of normal.blocks) delete item.iconFile;
    if(normal.groups) for(const group of normal.groups) for(const item of group.blocks || []) delete item.iconFile;
    assert.deepEqual(without,normal,detail);
    if(detail==='full') {
      assert.deepEqual(without.blocks[0].props,block.props);
      assert.deepEqual(without.blocks[0].slots,block.slots);
      assert.equal(without.blocks[0].icon,block.icon,'Declared icon metadata remains');
    }
  }
});
test('direct descriptor consumers retain the existing default icon behavior',()=>{
  const f=fixture();
  assert.equal(service.blockDescriptor(block,f.env).iconFile,'materialized');
  assert.equal(f.icons,1);
  service.blockDescriptor(block,f.env,{includeIcons:false});assert.equal(f.icons,1);
});
