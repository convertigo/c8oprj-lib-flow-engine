const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const catalog=vm.runInNewContext(fs.readFileSync(process.env.CATALOG_SERVICE_PATH||'_flow/modules/catalog-service.js','utf8'));
test('short catalog signatures retain the allowed literal choices',()=>{
 const descriptor={blockId:'sql.initialize',props:{onError:{kind:'template',type:'string',enum:['throw','return']}}};
 const summary=catalog.signatureBlockDescriptor(descriptor,{});
 assert.match(summary.props.onError,/throw.*return/);
 assert.match(summary.sig,/onError:.*throw.*return/);
});
