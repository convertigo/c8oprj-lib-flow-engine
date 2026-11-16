const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('_flow/blocks/http/request.block.js','utf8');
const start=source.indexOf('\tfunction readResponse('),end=source.indexOf('\n\tfunction isFileUrl',start);
const large='x'.repeat(1024);
const read=vm.runInNewContext(source.slice(start,end)+'\nreadResponse',{EntityUtils:{toString:()=>large},responseObject:()=>({text:large}),responseHeaders:()=>({})});
const response={getEntity:()=>({}),getFirstHeader:()=>null,getStatusLine:()=>({getStatusCode:()=>200})};
assert.throws(()=>read(response,null,'text',{read(){throw Error('HTTP_RESPONSE_TOO_LARGE');}}),/HTTP_RESPONSE_TOO_LARGE/);
console.log('boundary-http-volume OK');
