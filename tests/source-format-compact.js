// Compact values at the real statement column, with promotion and execution guards.
var engineDir=new java.io.File(arguments[0]).getCanonicalFile(),__flowEngineDir=String(engineDir);
var project=java.nio.file.Files.createTempDirectory('flow-compact-').toFile(),__flowProjectDir=String(project);
var files=Packages.org.apache.commons.io.FileUtils,checks=0;
function assert(v,m){checks++;if(!v)throw new Error(m);}
try {
 var engine=eval(String(files.readFileToString(new java.io.File(engineDir,'Engine.js'),'UTF-8')));
 function api(name,args){return JSON.parse(engine[name](JSON.stringify(args)));}
 function format(code){var p=api('flowSourceValidate',{name:'Compact',code:code});assert(p.ok,'parse '+JSON.stringify(p));var f=api('flowSourceValidate',{name:'Compact',flowSource:p.source,includeHeader:false,includeImplicitReturn:false});assert(f.ok,'render '+JSON.stringify(f));return f.code;}
 var compact='const _flow = { accessibility: "private", config: { enabled: true } }\n\nfunction Compact({ input, config, result }) {\n  result.meta = { short: "ok", nested: { n: 1 }, rows: [1, 2] }\n  return { answer: result.meta.short }\n}\n';
 assert(format(compact)===compact,'compact metadata, object and return stay compact');
 var set=api('flowCodeSet',{name:'Compact',code:compact});assert(set.ok,'set');
 var promoted=api('flowCodePromote',{name:'Compact',revision:set.revision});assert(promoted.ok,'tree guard accepts unchanged program '+JSON.stringify(promoted));
 assert(!promoted.linted && promoted.changedLines===0 && promoted.revision===set.revision,'no expansion, no revision change');
 var run=api('flowCodeRun',{name:'Compact'});assert(run.ok && run.result.answer==='ok' && run.result.meta.nested.n===1,'return retains execution semantics');
 ['  result.payload = { field: "','  local.cleaned = text.trim({ text: "','  return { field: "'].forEach(function(prefix){
  var suffix=prefix.indexOf('text.trim')>=0?'" })':'" }';
  [120,121].forEach(function(width){
   var statement=prefix+new Array(width-prefix.length-suffix.length+1).join('x')+suffix;
   var code='function Compact({ input, config, result }) {\n'+statement+'\n}\n',formatted=format(code);
   assert(format(formatted)===formatted,'idempotent boundary '+width);
   assert(formatted.split('\n').every(function(line){return line.length<=120;}),'column budget '+width);
   assert(width!==120 || formatted.indexOf(statement)>=0,'120 columns remain on one line');
   assert(width!==121 || formatted.indexOf(statement)<0,'121 columns break into properties');
  });
 });
 var labeled='function Compact({ input, config, result }) {\n  // Keep\n  chosen: return { answer: 1 }\n}\n';
 assert(format(labeled)===labeled,'return label and attached comment retained');
 print('source-format-compact OK ('+checks+' checks)');
} finally {files.deleteDirectory(project);}
