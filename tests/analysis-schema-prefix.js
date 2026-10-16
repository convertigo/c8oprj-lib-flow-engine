var root=String(new java.io.File(arguments[0]).getAbsolutePath());
var service=eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(root,"modules/flow-analysis-service.js"),"UTF-8")));
function assertTrue(v,m){if(!v)throw new Error(m);}
var env={schemaAtPath:function(schema,remainder){return {source:schema.id,remainder:remainder};}};
var schemas={"input":{id:"root"},"input.records":{id:"records"},"input.records[0]":{id:"row"},"input.records2":{id:"other"}};
Object.defineProperty(schemas,"input.records[0].hidden",{value:{id:"hidden"},enumerable:false});
Object.setPrototypeOf(schemas,{"input.inherited":{id:"inherited"}});
for(var i=0;i<10000;i++)schemas["local.unrelated"+i]={id:i};
[["input.records[0].value","row","value"],["input.records[0]","row",""],["input.records[0].hidden.x","row","hidden.x"],["input.records[1].value","records","[1].value"],["input.recordsX.value","root","recordsX.value"],["input.inherited.x","root","inherited.x"]].forEach(function(test){
 var found=service.schemaForSchemasPath(schemas,test[0],env);
 assertTrue(found.source===test[1]&&found.remainder===test[2],"longest own enumerable prefix for "+test[0]+": "+JSON.stringify(found));
});
assertTrue(service.schemaForSchemasPath(schemas,"result.missing",env)===null,"unrelated path stays unknown");
print("analysis schema prefix: ok");
