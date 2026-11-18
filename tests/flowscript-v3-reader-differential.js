var engineDir = new java.io.File(arguments.length ? arguments[0] : '_flow').getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory('flow-v3-differential-').toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, 'Engine.js'), 'UTF-8')));
var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, 'modules/flowscript-v3-prototype.js'), 'UTF-8')));
var codeService = eval(String(files.readFileToString(new java.io.File(engineDir, 'modules/flow-code-service.js'), 'UTF-8')));
var Reader = Packages.com.convertigo.libflowengine.FlowScriptV3Reader;
var root = engineDir.getParentFile();
function read(path) { return String(files.readFileToString(new java.io.File(root, path), 'UTF-8')); }
var cases = [];
function add(id, source) { if (/sourceVersion\s*:\s*3/.test(source)) cases.push({id:id, source:source}); }
function fences(id, source) {
  var pattern = /```(?:flowscript|javascript|js)(?:[^\n]*)\n([\s\S]*?)\n```/g, match, i=0;
  while ((match=pattern.exec(source)) !== null) add(id + ':' + (++i), match[1]);
}
fences('spec', read('docs/flowscript-v3.md'));
var rendering = JSON.parse(read('docs/flowscript-v3-rendering-cases.json')).cases;
rendering.forEach(function (item) { add('render:' + item.id, item.v3); });
var testSource = read('tests/flowscript-v3-prototype.js');
var options = new Packages.org.mozilla.javascript.CompilerEnvirons(); options.setLanguageVersion(200);
var ast = new Packages.org.mozilla.javascript.Parser(options).parse(testSource, 'prototype-tests', 1);
ast.visit(new Packages.org.mozilla.javascript.ast.NodeVisitor({visit:function (node) {
  if (String(node.getClass().getSimpleName()) !== 'FunctionCall') return true;
  var target = String(node.getTarget().toSource()).trim();
  if (target !== 'runs' && target !== 'refuses') return true;
  var args = node.getArguments();
  if (args.size() < 2 || String(args.get(0).getClass().getSimpleName()) !== 'StringLiteral' || String(args.get(1).getClass().getSimpleName()) !== 'StringLiteral') return true;
  var label = String(args.get(0).getValue()), body = String(args.get(1).getValue());
  add('prototype:' + label, 'const _flow = { sourceVersion: 3 }\nfunction Example({ input, config, result }) {\n' + body + '\n}');
  return true;
}}));
var guideRoot = new java.io.File(root, '../lib_flow_mcp/_flow/resources').getCanonicalFile();
var guidePaths = ['guide/authoring.md','guide/authoring-collections.md','guide/authoring-data.md','guide/authoring-source.md','guide/authoring-blocks.md','guide/authoring/dialect.md','guide/authoring/expressions.md','guide/start.md','guide/start/syntax.md','skills/convertigo-flow-backend/SKILL.md','skills/convertigo-flow-mcp/SKILL.md'];
guidePaths.forEach(function (path) { var file = new java.io.File(guideRoot,path); if (file.isFile()) fences('guide:' + path, String(files.readFileToString(file,'UTF-8'))); });
var samples = new java.io.File(root,'../samples-m1');
if (samples.isDirectory()) { var listed = samples.listFiles(); for (var i=0; i<listed.length; i++) if (listed[i].isFile()) add('sample:' + listed[i].getName(), String(files.readFileToString(listed[i],'UTF-8'))); }
var traceFile = new java.io.File(root,'_private/v3-trace-corpus/trace-cases.json');
if (traceFile.isFile()) JSON.parse(String(files.readFileToString(traceFile,'UTF-8'))).forEach(function(item){add('trace:'+item.id,item.source);});
function difference(a,b,path) {
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return JSON.stringify(a) === JSON.stringify(b) ? '' : path + ': ' + JSON.stringify(a).substring(0,120) + ' != ' + JSON.stringify(b).substring(0,120);
  var keys = Object.keys(a).concat(Object.keys(b)).filter(function(v,i,all){return all.indexOf(v)===i;}).sort();
  for (var i=0;i<keys.length;i++) { var found=difference(a[keys[i]],b[keys[i]],path + '.' + keys[i]); if(found) return found; }
  return '';
}
var catalogCache={};
function catalog(name) {
  if (catalogCache[name] !== undefined) return catalogCache[name];
  var file=new java.io.File(engineDir,'blocks/'+String(name).replace(/\./g,'/')+'.block.js');
  if (!file.isFile()) return catalogCache[name]='{}';
  var match=/const _meta\s*=\s*([\s\S]*?)\n\s*\(function/.exec(String(files.readFileToString(file,'UTF-8')));
  if (!match) return catalogCache[name]='{}';
  try { var metadata=eval('('+match[1]+')'); return catalogCache[name]=JSON.stringify({props:metadata.properties||{}}); }
  catch(e) { return catalogCache[name]='{}'; }
}
// Keep the remaining AST-reader acceptances beyond the v2 text parser explicit.
var acceptedBeyondV2={
	'trace:f3l3b_g6sol:csv_stats:57':'INVALID_EXPRESSION',
	'trace:f3l3b_g6sol:csv_stats:58':'INVALID_EXPRESSION',
  'trace:f3l3b_g6sol:csv_stats:59':'INVALID_EXPRESSION',
	'trace:f3l3b_ml4:csv_stats:62':'INVALID_EXPRESSION',
	'trace:f3l3b_ml4:csv_stats:63':'INVALID_EXPRESSION',
	'trace:f3l3b_ml4:csv_stats:64':'INVALID_EXPRESSION',
	'trace:f3l3b_ml4:csv_stats:65':'INVALID_EXPRESSION',
  'trace:f3l3b_ml4:csv_stats:66':'INVALID_EXPRESSION',
  'trace:f3m1b_g6sol:stats:88':'INVALID_EXPRESSION'
};
var checked=0, skipped=0, wanted=0, wantedIds=[], mismatches=[], bySource={};
cases.forEach(function(item) {
  var translated = bridge.translate(item.source), direct = JSON.parse(String(Reader.read(item.source,catalog)));
  var expectedError = translated.diagnostics.length ? translated.diagnostics[0] : null;
  var actualError = direct.diagnostics.length ? direct.diagnostics[0] : null;
  var kind = item.id.split(':')[0]; bySource[kind]=(bySource[kind]||0)+1;

  if (expectedError || actualError) {
    if (!expectedError || !actualError || expectedError.code !== actualError.code || expectedError.line !== actualError.line)
      mismatches.push(item.id + ' diagnostic ' + (expectedError && expectedError.code + '/' + expectedError.line) + ' != ' + (actualError && actualError.code + '/' + actualError.line));
    checked++; return;
  }
  var oracle = JSON.parse(String(engine.flowSourceValidate(JSON.stringify({name:'Example',code:translated.code,skipAnalysis:true}))));
  if (!oracle.ok) {
    skipped++;
    var integrated=JSON.parse(String(engine.flowSourceValidate(JSON.stringify({name:'Example',code:item.source,skipAnalysis:true}))));
    var expectedParserCode=oracle.error && oracle.error.code || oracle.diagnostics && oracle.diagnostics[0] && oracle.diagnostics[0].code;
    var actualParserCode=integrated.error && integrated.error.code || integrated.diagnostics && integrated.diagnostics[0] && integrated.diagnostics[0].code;
    if (expectedParserCode !== actualParserCode) {
      if (acceptedBeyondV2[item.id] === expectedParserCode && integrated.ok === true) { wanted++; wantedIds.push(item.id); }
      else mismatches.push(item.id + ' parser diagnostic ' + expectedParserCode + ' != ' + actualParserCode);
    }
    checked++;
    return;
  }
  oracle.definition.flow = Object.assign({},oracle.definition.flow||{},{sourceVersion:3});
  var expected = codeService.comparableDefinition(oracle.definition), actual = codeService.comparableDefinition(direct.definition);
  if (expected !== actual) mismatches.push(item.id + ' definition ' + (kind === 'trace' ? difference(JSON.parse(expected),JSON.parse(actual),'root').split(':')[0] + ' (values withheld)' : difference(JSON.parse(expected),JSON.parse(actual),'root')));
  checked++;
});
print('differential corpus ' + JSON.stringify({total:cases.length,bySource:bySource,checked:checked,oracleRejected:skipped,wantedDifferences:wanted,wantedIds:wantedIds,differences:mismatches.length}));
if (mismatches.length) throw new Error('Differential mismatches:\n' + mismatches.slice(0,80).join('\n'));
