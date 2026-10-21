var root=new java.io.File(arguments[0]||'_flow').getCanonicalFile(),files=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=String(root),temporary=java.nio.file.Files.createTempDirectory('flow-rows-cells-').toFile(),__flowProjectDir=String(temporary);
try{
 files.copyDirectory(new java.io.File(root.getParentFile(),'tests/fixtures/runtime-rows/_flow'),new java.io.File(temporary,'_flow'));
 var engine=eval(String(files.readFileToString(new java.io.File(root,'Engine.js'),'UTF-8')));
 var input={rows:[{id:1,active:true,c0:'<One&>',c1:3.25,c2:true},{id:2,active:false,c0:'excluded',c1:4,c2:false}],columns:[{name:'c0',kind:'text'},{name:'c1',kind:'number'},{name:'c2',kind:'boolean'}]};
 var req={name:'RowsCells',flowSource:String(files.readFileToString(new java.io.File(temporary,'_flow/flows/RowsCells.flow.js'),'UTF-8')),input:input,includeTrace:false};
 var expected={rows:[{id:1,c0:{value:'<One&>',text:'&lt;One&amp;&gt;',numeric:false},c1:{value:3.25,text:'3.25',numeric:true},c2:{value:true,text:'Oui',numeric:false}}],count:1};
 for(var i=0;i<3;i++){if(i===2)req.profile=true;var out=JSON.parse(String(engine.run(JSON.stringify(req))));if(!out.ok||JSON.stringify(out.result)!==JSON.stringify(expected))throw new Error('Row/cell parity failed: '+JSON.stringify(out));}
 if(!out.profile||!out.profile.blocks.some(function(b){return b.name==='bench.formatCell'&&typeof b.allocatedBytes==='number'&&b.allocatedBytes>0;}))throw new Error('Deep profile must expose current-thread allocations for a Flow block');
 print('runtime-rows-cells: filter, nested Flow formatting, projection, plan reuse, profiling allocation and exact result OK');
}finally{files.deleteDirectory(temporary);}
