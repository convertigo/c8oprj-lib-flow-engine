const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ids=vm.runInNewContext(fs.readFileSync('_flow/modules/debug-source-identities.js','utf8'));
test('duplicate ids, lowered nodes, helpers and slots keep distinct revision-bound identities',()=>{
 const a={id:'same',block:'list.map',__flowScriptLine:4,props:{business:[{block:'fake'}]},then:[{id:'same',block:'json.object',__flowScriptLine:4}]};
 const b={id:'same',block:'log',__flowScriptLine:9};
 const d={nodes:[a,b],helpers:[{nodes:[{block:'return',__flowScriptLine:15}]}]};
 const before=JSON.stringify(d),table=ids.create(d,'Project/_flow/flows/Example.flow.js','revision-a');
 assert.equal(table.entries.length,4);assert.equal(new Set(table.entries.map(e=>e.url)).size,4);
 assert.equal(table.get(a).pointer,'/nodes/0');assert.equal(table.get(a.then[0]).pointer,'/nodes/0/then/0');
 assert.equal(table.get(a).line,4);assert.equal(table.get(a.then[0]).line,4);
 assert.notEqual(table.get(b).url,ids.create(d,'Project/_flow/flows/Example.flow.js','revision-b').get(b).url);
 assert.equal(JSON.stringify(d),before);assert.equal(table.get(a.props.business[0]),undefined);
 assert.equal(ids.target('Project/_flow/flows/Example.flow.js','revision-a','nodes[0]',a).url,table.get(a).url);
});
test('the source table survives JSON execution snapshots without annotating shared nodes',()=>{
 const d={nodes:[{block:'value',__flowScriptLine:7}]},copy=JSON.parse(JSON.stringify(d));
 assert.equal(ids.create(d,'P/file','r').get(d.nodes[0]).url,ids.create(copy,'P/file','r').get(copy.nodes[0]).url);
 assert.notEqual(ids.create(d,'P/file','r').get(d.nodes[0]).url,ids.create(d,'Other/file','r').get(d.nodes[0]).url);
});
