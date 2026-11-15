// Fast, isolated before/after witnesses. No checkout, service or external network operation.
const assert=require('node:assert/strict'),cp=require('node:child_process');
const baseline=process.env.AUDIT_BASELINE_REF||'dde059c495790b216d74163ab416518925eb9886';
const available=cp.spawnSync('git',['cat-file','-e',baseline],{stdio:'ignore'}).status===0;
const tests={F01:'authoring',F02:'schema-paths',F03:'cell-html',F04:'http-boundaries',F05:'file-paths',F06:'asset-scope',F07:'http-volume',F08:'yaml-budgets',F11:'smtp-identity'};
for(const [finding,name] of Object.entries(tests)){
 const file='tests/audit-'+name+'.cjs';
 if(available){
 const before=cp.spawnSync(process.execPath,['-r','./tests/audit-baseline-loader.cjs',file],{env:{...process.env,AUDIT_BASELINE_REF:baseline},encoding:'utf8',timeout:10000});
 assert.equal(before.status,1,finding+' witness should fail on baseline: '+before.stdout+before.stderr);
 assert.match(before.stderr,/AssertionError/,finding+' should fail an expectation, not its harness: '+before.stderr);
 }
 const after=cp.spawnSync(process.execPath,[file],{env:{...process.env,AUDIT_BASELINE_REF:''},encoding:'utf8',timeout:10000});
 assert.equal(after.status,0,finding+' should pass after: '+after.stdout+after.stderr);
 console.log(finding+': '+(available?'baseline FAIL (assertion), ':'baseline unavailable, ')+'current PASS ('+file+')');
}
