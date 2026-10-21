var File=java.io.File, files=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=String(new File(arguments[0]).getCanonicalPath());
var temporary=java.nio.file.Files.createTempDirectory('flow-rows-parity-').toFile(), __flowProjectDir=String(temporary);
function readFile(name) { return String(files.readFileToString(new File(new File(__flowEngineDir).getParentFile(),name),'UTF-8')); }
function assert(ok,message) { if(!ok)throw new Error(message); }
try {
 var engine=eval(String(files.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8')));
 var cases=JSON.parse(readFile('_flow/portable-axiom-fixtures.json')).filter(function(f){return f.block.indexOf('rows.')===0;});
 var errors=JSON.parse(readFile('tests/fixtures/rows-errors.json')), results=[];
 function run(block,input) { var code='const _flow={sourceVersion:2};\nfunction Test({result}){\n result.value='+block+'('+JSON.stringify(input)+')\n}\n';return JSON.parse(String(engine.run(JSON.stringify({flowSource:code,includeTrace:false})))); }
 cases.forEach(function(f) {
  var out=run(f.block,f.input);
  assert(out.ok&&JSON.stringify(out.result.value)===JSON.stringify(f.expected),'Rhino fixture '+f.block+': '+JSON.stringify(out));
  results.push(out.result.value);
 });
 errors.forEach(function(f) { var out=run('rows.'+f[0],f[1]);assert(!out.ok&&out.error.code===f[2],'Rhino error '+JSON.stringify(f)+': '+JSON.stringify(out)); });
 var kernel=eval(readFile('_flow/lib/rows.js'));
 var data=JSON.parse('{"__proto__":{"polluted":true},"constructor":1,"x":0}');
 var projected=kernel.select({rows:[data],columns:['__proto__','constructor','x']});
 assert(JSON.stringify(projected[0])===JSON.stringify(data),'Own special keys must survive projection');
 assert(({}).polluted===undefined,'No prototype pollution');
 assert(JSON.stringify(kernel.read({rows:[{}],path:'$.constructor'}))==='[null]','No inherited property traversal');
 assert(kernel.distinct({rows:[{a:'x|b=y',b:'z'},{a:'x',b:'y|b=z'}],columns:['a','b']}).length===2,'No composite key delimiter collisions');
 var original=JSON.stringify(data);kernel.formatCells({rows:[data],columns:[{name:'x',type:'number'}]});assert(JSON.stringify(data)===original,'Input unchanged');
 try{kernel.read({rows:[{}]},{canContinue:function(){return false;}});throw new Error('Cancellation ignored');}catch(e){assert(e.code==='FLOW_EXECUTION_CANCELLED','Cancellation diagnostic');}
 var source='const _flow={sourceVersion:2,inputs:{rows:{type:"array",items:{type:"object",properties:{n:{type:"number"}}}}}};\nfunction Shape({input,result}){\nresult.rows=rows.formatCells({rows:input.rows,columns:[{name:"n",type:"number"}]})\n}\n';
 var analysis=JSON.parse(String(engine.flowCodeCheck(JSON.stringify({code:source}))));
 assert(analysis.ok,'Typed row contracts validate: '+JSON.stringify(analysis));
 var schema=JSON.parse(String(engine.outputSchema(JSON.stringify({flowSource:source}))));
 assert(JSON.stringify(schema).indexOf('"text":{"type":"string"}')>=0,'Cell output schema has text: '+JSON.stringify(schema));
 print('ROWS_PARITY '+JSON.stringify({values:results,errors:errors.length,assertions:cases.length+errors.length+8}));
} finally { files.deleteDirectory(temporary); }
