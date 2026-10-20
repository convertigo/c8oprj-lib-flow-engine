const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../_flow/blocks/file/download.browser.js'),'utf8');
let clicks=0,removed=0,revoked=0,blobs=[];
class DownloadURL extends URL {static createObjectURL(blob){blobs.push(blob);return 'blob:test';}static revokeObjectURL(){revoked++;}}
const document={baseURI:'https://example.test/app/',body:{appendChild(){}},createElement(){return {style:{},click(){clicks++;},remove(){removed++;}};}};
let response;
const fn=vm.runInNewContext('('+source+')',{URL:DownloadURL,Blob,document,setTimeout:fn=>fn(),fetch:async()=>response});
async function rejects(input,code,execution){await assert.rejects(async()=>fn(input,execution),e=>e.code===code);}
(async()=>{
 const out=fn({content:'\ufeffÉquipe 🧪',filename:'été.csv',mimeType:'text/csv;charset=utf-8'});
 assert.equal(out.size,15);assert.equal(out.filename,'été.csv');assert.equal(clicks,1);assert.equal(removed,1);assert.equal(revoked,1);
 assert.equal(await blobs[0].text(),'Équipe 🧪'); // Blob.text consumes the UTF-8 BOM.
 assert.deepEqual([...new Uint8Array(await blobs[0].arrayBuffer())].slice(0,3),[239,187,191]);
 await rejects({},'DOWNLOAD_SOURCE_INVALID');await rejects({content:'',url:'/file'},'DOWNLOAD_SOURCE_INVALID');
 await rejects({content:'abc',maxBytes:2},'DOWNLOAD_TOO_LARGE');await rejects({content:'',maxBytes:0},'DOWNLOAD_BOUNDS');
 await rejects({content:7},'DOWNLOAD_CONTENT_INVALID');await rejects({url:'javascript:alert(1)'},'DOWNLOAD_URL_INVALID');
 await rejects({content:'x' },'DOWNLOAD_CANCELLED',{canContinue:()=>false});
 response=new Response('download',{status:200});assert.equal((await fn({url:'/file'})).size,8);
 response=new Response('denied',{status:403});await rejects({url:'/file'},'DOWNLOAD_HTTP_ERROR');
 response=new Response('too large',{status:200,headers:{'content-length':'9'}});await rejects({url:'/file',maxBytes:3},'DOWNLOAD_TOO_LARGE');
 response=new Response(new Uint8Array([1,2,3,4]));await rejects({url:'/file',maxBytes:3},'DOWNLOAD_TOO_LARGE');
 assert.equal(clicks,2);assert.equal(removed,2);assert.equal(revoked,2);
 console.log('file.download: content/URL, UTF-8, bounds, HTTP error, cancellation and cleanup passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
