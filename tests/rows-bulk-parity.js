const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
cp.execFileSync(process.execPath,[path.join(root,'tools/build-rows-browser.cjs'),'--check']);
const cases=JSON.parse(fs.readFileSync(path.join(root,'_flow/portable-axiom-fixtures.json'))).filter(f=>f.block.startsWith('rows.'));
const errors=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/rows-errors.json')));
const peers=new Map(['formatCells','distinct','group','select','read'].map(name=>[name,vm.runInNewContext('('+fs.readFileSync(path.join(root,'_flow/blocks/rows',name+'.browser.js'),'utf8')+')',{Intl,Date})]));
const json=value=>JSON.parse(JSON.stringify(value));
for(const f of cases){const before=JSON.stringify(f.input);assert.deepEqual(json(peers.get(f.block.slice(5))(f.input)),f.expected,f.block);assert.equal(JSON.stringify(f.input),before,'Inputs unchanged');}
for(const [name,input,code] of errors)assert.throws(()=>peers.get(name)(input),error=>error.code===code,name+' '+code);
assert.throws(()=>peers.get('read')({rows:[{}]},{canContinue:()=>false}),error=>error.code==='FLOW_EXECUTION_CANCELLED');
assert.throws(()=>peers.get('formatCells')({rows:[{}]}),error=>error.code==='ROWS_OPTIONS_INVALID');
const malicious=JSON.parse('{"__proto__":{"polluted":true},"constructor":1,"x":0}');
assert.deepEqual(json(peers.get('select')({rows:[malicious],columns:['__proto__','constructor','x']})),[malicious]);
assert.equal({}.polluted,undefined);
assert.deepEqual(json(peers.get('read')({rows:[{}],path:'$.constructor'})),[null]);
const jar=process.env.CONVERTIGO_DEPENDENCIES_JAR;assert.ok(jar,'Set CONVERTIGO_DEPENDENCIES_JAR');
const output=cp.execFileSync('java',['-Xmx1024m','-Djava.awt.headless=true','-cp',jar,'org.mozilla.javascript.tools.shell.Main','-version','200',path.join(root,'tools/test-rows-rhino.js'),path.join(root,'_flow')],{encoding:'utf8',maxBuffer:4*1024*1024});
const line=output.split('\n').find(l=>l.startsWith('ROWS_PARITY '));assert.ok(line,output);
const result=JSON.parse(line.slice(12));assert.deepEqual(result.values,cases.map(f=>f.expected));
console.log(`rows-bulk-parity: ${result.assertions} Rhino assertions + browser parity, failures, cancellation, own keys, no mutation and generated-peer check passed`);

const poisoned=vm.createContext({});
const kernelSource=fs.readFileSync(path.join(root,'_flow/lib/rows.js'),'utf8');
vm.runInContext('var kernel='+kernelSource+';Object.defineProperty(Object.prototype,"poisonedColumn",{configurable:true,set:function(){throw Error("setter called");}});var projected=kernel.select({rows:[{poisonedColumn:7}],columns:["poisonedColumn"]})[0];if(!Object.getOwnPropertyDescriptor(projected,"poisonedColumn").writable||projected.poisonedColumn!==7)throw Error("own data lost");',poisoned);
