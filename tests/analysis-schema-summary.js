var root=String(new java.io.File(arguments[0]).getAbsolutePath());
var utils=eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(root,"modules/schema-utils.js"),"UTF-8")));
function assertTrue(v,m){if(!v)throw new Error(m);}
var copies=0;
var env={normalizeTree:function(v){copies++;return JSON.parse(JSON.stringify(v));}};
var properties={};
for(var i=0;i<50;i++)properties["field"+i]={type:i%2?"string":"array",items:{type:"object",properties:{value:{type:"number"}}}};
Object.defineProperty(properties,"__proto__",{value:{type:"boolean"},enumerable:true});
var schema={type:"object",properties:properties,description:"kept at the boundary"};
var before=JSON.stringify(schema);
var expected={type:utils.simpleType(schema,env),paths:utils.paths(schema,"",env).slice(0,20),arrayPaths:utils.arrayPaths(schema,"",env).slice(0,20),leafPaths:utils.leafEntries(schema,"",env).slice(0,20)};
copies=0;
var summary=utils.summary(schema,env);
assertTrue(copies===1,"a summary normalizes once, not for each projection: "+copies);
assertTrue(JSON.stringify(summary)===JSON.stringify(expected),"summary keeps ordering, truncation and array paths");
summary.paths.push("changed");summary.leafPaths[0].type="changed";
assertTrue(JSON.stringify(schema)===before,"editing a summary must not modify its source");
[null,"string",{type:"array",items:{type:"object",properties:{name:{type:"string"}}}}].forEach(function(value){
 var out=utils.summary(value,env);
 assertTrue(JSON.stringify(out)==JSON.stringify({type:utils.simpleType(value,env),paths:utils.paths(value,"",env).slice(0,20),arrayPaths:utils.arrayPaths(value,"",env).slice(0,20),leafPaths:utils.leafEntries(value,"",env).slice(0,20)}),"summary parity for "+JSON.stringify(value));
});
print("analysis schema summary: ok");
