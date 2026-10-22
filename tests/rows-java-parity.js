// Same synthetic corpus through the JS reference, browser peer and Java library.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),jar=process.env.CONVERTIGO_DEPENDENCIES_JAR;
assert.ok(jar,'Set CONVERTIGO_DEPENDENCIES_JAR to the engine runtime classpath');
cp.execFileSync(process.execPath,[path.join(root,'tools/build-rows-browser.cjs'),'--check']);
const output=cp.execFileSync('java',['-Xmx1024m','-Djava.awt.headless=true','-cp',jar+path.delimiter+path.join(root,'libs/build/classes'),'org.mozilla.javascript.tools.shell.Main','-version','200',path.join(root,'tools/test-rows-java.js'),path.join(root,'_flow')],{encoding:'utf8',maxBuffer:8*1024*1024});
const line=output.split('\n').find(l=>l.startsWith('ROWS_JAVA '));assert.ok(line,output);
const result=JSON.parse(line.slice(10)),cases=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/rows-java.json')));
const peers=new Map(['formatCells','read','select'].map(name=>[name,vm.runInNewContext('('+fs.readFileSync(path.join(root,'_flow/blocks/rows',name+'.browser.js'),'utf8')+')',{Intl,Date})]));
for(let i=0;i<cases.length;i++){
 const f=cases[i],before=JSON.stringify(f.input),actual=peers.get(f.operation)(f.input);
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),result.values[i],f.name);assert.equal(JSON.stringify(f.input),before,f.name+' input unchanged');
}
console.log('rows-java-parity: '+cases.length+' JS/Rhino/Java/browser cases, '+result.nativeCount+' Java executions, '+result.fallbackCount+' fallbacks; '+result.errorCount+' error contracts, '+result.pipelines+' pipelines and fallback cancellation parity');
