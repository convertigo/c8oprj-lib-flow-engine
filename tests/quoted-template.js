var engineDir=new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir=String(engineDir),project=java.nio.file.Files.createTempDirectory('quoted-template-').toFile(),__flowProjectDir=String(project);
var files=Packages.org.apache.commons.io.FileUtils;
try {
 var engine=eval(String(files.readFileToString(new java.io.File(engineDir,'Engine.js'),'UTF-8')));
 function check(value,block){return JSON.parse(engine.flowSourceValidate(JSON.stringify({name:'Mail',code:'const _flow={sourceVersion:2}\nfunction Mail({input,result}) {\nresult.body='+ (block||'template.render')+'({template:'+value+'})\n}'})));}
 function assert(v,m){if(!v)throw Error(m);}
 var bad=check('"Hello ${input.name}"');
 assert(!bad.ok && bad.error && bad.error.code==='FLOWSCRIPT_QUOTED_TEMPLATE','quoted template must be refused: '+JSON.stringify(bad));
 assert(check('`Hello ${input.name}`').ok,'backtick interpolation accepted');
 assert(check('"Hello"').ok,'plain text accepted');
 assert(check('`Literal \\${input.name}`').ok,'escaped backtick text accepted');
 print('quoted-template OK');
}finally{files.deleteQuietly(project);}
