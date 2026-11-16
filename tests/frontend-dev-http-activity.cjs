'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const lifecycle = vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../_flow/modules/frontend-dev-lifecycle.js'),'utf8'));
const start = 1700000000000;
const entry = {startedAt:new Date(start).toISOString(),idlePolicy:{firstViewerTimeoutMs:1000,noViewerTimeoutMs:500,viewerStaleMs:100}};
// A plain HTTP client continues serving beyond the first-viewer deadline.
for(let elapsed=100;elapsed<=2000;elapsed+=100){
 const out=lifecycle.update(entry,{viewers:[],lastHttpAt:start+elapsed},start+elapsed);
 assert.equal(out.stopReason,'');assert.equal(out.viewerCount,1);
}
assert.ok(entry.firstViewerAt);
// A request still being served remains activity even beyond the stale window.
assert.equal(lifecycle.update(entry,{viewers:[],lastHttpAt:start+2000,activeHttpRequests:1},start+3000).stopReason,'');
lifecycle.update(entry,{viewers:[],lastHttpAt:start+3000},start+3200);
assert.equal(lifecycle.update(entry,{viewers:[],lastHttpAt:start+3000},start+3700).stopReason,'no-viewer-timeout');
const unused={startedAt:new Date(start).toISOString(),idlePolicy:{firstViewerTimeoutMs:1000}};
assert.equal(lifecycle.update(unused,{viewers:[]},start+1000).stopReason,'first-viewer-timeout');
console.log('frontend-dev-http-activity OK');
