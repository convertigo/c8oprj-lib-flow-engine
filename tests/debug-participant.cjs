const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const plugin=vm.runInNewContext(fs.readFileSync('_flow/modules/flow-debugger-participant.js','utf8'));
test('private wrappers expose arguments and completed outputs with paired frame cleanup',()=>{
 const node={props:{value:42}},phases=[];let inspect;
 const wrapped=plugin.create((_kind,callback)=>{inspect=callback;return {enter(id){phases.push(['enter',id]);},at(id,phase){phases.push([phase,JSON.parse(inspect(id,'variables',''))]);},leave(id){phases.push(['leave',id]);}};},{get:()=>({url:'opaque:test',line:2})},'source').wrap({run(ctx,n){return n.props.value;}});
 assert.equal(wrapped.run({scopes:{input:{},local:{},result:{}}},node),42);
 assert.deepEqual(phases.map(p=>p[0]),['enter','before','after','leave']);
 assert.equal(phases[1][1].scopes[1].variables[0].value,'42');assert.equal(phases[2][1].scopes[2].variables[0].value,'42');
 assert.throws(()=>inspect('1','variables',''),/Expired/);
});
test('errors unwind the activation and accessors are never evaluated by inspection',()=>{
 let reads=0,inspect;const props={};Object.defineProperty(props,'secret',{enumerable:true,get(){reads++;throw Error('getter');}});
 const phases=[];const block=plugin.create((_kind,callback)=>{inspect=callback;return {enter(){},at(id){inspect(id,'variables','');},leave(){phases.push('leave');}};},{get:()=>({})},'').wrap({run(){throw Error('business');}});
 assert.throws(()=>block.run({scopes:{}},{props}),/business/);assert.equal(reads,0);assert.deepEqual(phases,['leave']);
});

test('resolved arguments are separate from source properties and @ scopes do not force lazy values',()=>{
 let inspect,reads=0,seen;
 const scopes={input:{n:41},local:{},result:{},current:42};
 Object.defineProperty(scopes,'config',{enumerable:true,get(){reads++;throw Error('forced config');}});
 const debug=plugin.create((_kind,callback)=>{inspect=callback;return {enter(){},at(id){seen=JSON.parse(inspect(id,'variables',''));},leave(){}};},{get:()=>({url:'test',line:1})},'');
 const activation=debug.enter({scopes},{props:{value:'${input.n + 1}'}});
 activation.before({value:42});
 assert.equal(seen.scopes.find(group=>group.name==='Arguments').variables[0].value,'42');
 const bindings=seen.scopes.find(group=>group.name==='@').variables;
 assert.equal(bindings.find(row=>row.name==='@current').value,'42');
 assert.equal(bindings.find(row=>row.name==='@config').value,'<accessor>');assert.equal(reads,0);
 activation.leave();
});
