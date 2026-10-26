(function(){
 var root=arguments[0],IO=Packages.org.apache.commons.io.FileUtils;
 function read(file){return String(IO.readFileToString(new java.io.File(file),'UTF-8'));}
 var source=read(root+'/lib/rows.js');
 var reference=eval(source.replace(/\s*\/\* JAVA_DISPATCH_BEGIN[\s\S]*?JAVA_DISPATCH_END \*\//,''));
 var javaRows=Packages.com.convertigo.libflowengine.Rows;
 if(typeof javaRows.run!=='function'||!javaRows.available())throw Error('Java row kernel unavailable');
 var cases=JSON.parse(read(root+'/../tests/fixtures/rows-java.json'));
 var values=[],nativeCount=0,fallbackCount=0;
 function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object'){var out={};Object.keys(v).sort().forEach(function(k){Object.defineProperty(out,k,{value:canonical(v[k]),enumerable:true});});return out;}return v;}
 cases.forEach(function(f,index){
  var p=JSON.parse(JSON.stringify(f.input)),before=JSON.stringify(p),expected=reference[f.operation](p);
  var actual=javaRows.run(f.operation,p,null);
  if(actual===null){fallbackCount++;if(!f.fallback)throw Error('Unexpected fallback: '+f.name);actual=reference[f.operation](p);}else nativeCount++;
  if(JSON.stringify(canonical(actual))!==JSON.stringify(canonical(expected)))throw Error('Parity: '+f.name+' expected '+JSON.stringify(canonical(expected))+' got '+JSON.stringify(canonical(actual)));
  if(JSON.stringify(p)!==before)throw Error('Input mutation: '+f.name);
  values.push(JSON.parse(JSON.stringify(actual)));
 });
 var errorCount=0;
 JSON.parse(read(root+'/../tests/fixtures/rows-errors.json')).forEach(function(f){
  if(['read','select','formatCells'].indexOf(f[0])===-1)return;
  var code=null;try{javaRows.run(f[0],f[1],null);}catch(e){code=e.code;}
  if(code!==f[2])throw Error('Java error parity: '+f[0]+' expected '+f[2]+' got '+code);errorCount++;
 });
 // Explicit undefined is not JSON data. Keep reference semantics, including
 // the difference between an absent property and an own undefined property.
 [{rows:[{x:1}],columns:['x'],maxRows:undefined},{rows:[{x:undefined}],columns:['x']}].forEach(function(input){
  if(javaRows.run('select',input,null)!==null)throw Error('Explicit undefined must use the JS fallback');
 });
 var getterReads=0,exotic={rows:[{x:1}]};Object.defineProperty(exotic,'columns',{get:function(){getterReads++;return ['x'];}});
 if(javaRows.run('select',exotic,null)!==null||getterReads!==0)throw Error('Speculative getter invoked');
 var steps=[{operation:'formatCells',options:{profile:'table',includeFields:true,schema:[{name:'x',type:'number',number_decimal_places:2}]}},{operation:'select',options:{columns:['x']}}];
 var pipeline=javaRows.prepare(steps);if(pipeline===null)throw Error('Pipeline unavailable');
 for(var pi=0;pi<20;pi++){
  var rows=[{x:String(pi+'.25'),unused:'discard'}];
  var formatted=reference.formatCells(Object.assign({rows:rows},steps[0].options));
  var expectedPipeline={rows:reference.select({rows:formatted.rows,columns:['x']}),fields:formatted.fields};
  var actualPipeline=pipeline.apply(rows);if(actualPipeline===null||JSON.stringify(canonical(actualPipeline))!==JSON.stringify(canonical(expectedPipeline)))throw Error('Pipeline parity '+pi);
 }
 var optimized=eval(source),cancelCalls=0;
 var legacy={profile:'table',rows:[{x:'not-a-date'}],schema:[{name:'x',type:'date'}]};
 var legacyValue=optimized.formatCells(legacy,{canContinue:function(){cancelCalls++;return true;}}),referenceCalls=0;
 var legacyExpected=reference.formatCells(legacy,{canContinue:function(){referenceCalls++;return true;}});
 if(JSON.stringify(canonical(legacyValue))!==JSON.stringify(canonical(legacyExpected))||cancelCalls!==referenceCalls)throw Error('Legacy fallback callback parity');
 print('ROWS_JAVA '+JSON.stringify({nativeCount:nativeCount,fallbackCount:fallbackCount,errorCount:errorCount,pipelines:20,fallbackControl:true,values:values}));
}).apply(null,arguments);
