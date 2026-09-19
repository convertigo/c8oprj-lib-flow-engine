// Actual Rhino parser/writer/runtime regression for data mistaken for locals.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-expression-references-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils, checks = 0;
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
function equal(actual, expected, message) {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message + ": " + JSON.stringify(actual));
}
try {
  var parser = eval(read(new java.io.File(engineDir, "modules/flow-script-parser-service.js")));
  [
    ['model + "/model/" + \'local.model\'', 'local.model + "/model/" + \'local.model\''],
    ['input.model || model . name', 'input.model || local.model . name'],
    ['model["model"] + model$ + $model', 'local.model["model"] + local.model$ + local.$model'],
    ['model ? model : "model"', 'local.model ? local.model : "model"'],
    ['{model: model, other: input.model}', '{model: local.model, other: input.model}'],
    ['model /* model */ + "\\\"model"', 'local.model /* model */ + "\\\"model"'],
    ['model // model\n+ "model"', 'local.model // model\n+ "model"']
  ].forEach(function (fixture) {
    var lowered = parser.flowScriptRewriteExpression(fixture[0], {model:true, model$:true, $model:true}, {});
    equal(lowered, fixture[1], 'lowering');
    equal(parser.rewriteExpressionReferences(lowered, {'local.model':'model','local.model$':'model$','local.$model':'$model'}), fixture[0], 'inverse');
  });
  equal(parser.rewriteExpressionReferences('a + b', {a:'b',b:'c'}), 'b + c', 'no cascaded aliases');
  equal(parser.rewriteExpressionReferences('1e3 + 0xff + e3', {e3:'local.e3',xff:'local.xff'}), '1e3 + 0xff + local.e3', 'numeric boundaries');
  var engine = eval(read(new java.io.File(engineDir, "Engine.js")));
  function api(name, request) {
    var result = JSON.parse(engine[name](JSON.stringify(request)));
    equal(result.ok, true, name + ' succeeded ' + JSON.stringify(result.diagnostics || []));
    return result;
  }
  [1,2].forEach(function (version) {
    var code = 'const _flow={sourceVersion:' + version + '};\nfunction ReferenceProof(){\n'
      + 'var model = input.model\nvar appId = input.appId\n'
      + 'var modelPath = input.modelPath || "_flow/frontbuilder/svelte/model/" + appId + "/src/routes/+page.flow.svelte"\n'
      + 'return {path:modelPath,label:"model:" + model,original:"local.model:" + model,template:`model: ${model}`}\n}';
    var parsed = api('flowSourceValidate', {name:'ReferenceProof', code:code});
    var written = api('flowSourceValidate', {name:'ReferenceProof', flowSource:parsed.source, includeHeader:false});
    var input = {model:'yes', appId:'Sample'};
    var expected = {path:'_flow/frontbuilder/svelte/model/Sample/src/routes/+page.flow.svelte', label:'model:yes', original:'local.model:yes', template:'model: yes'};
    equal(api('run', {flowSource:code,input:input,includeTrace:false}).result, expected, 'original runtime v' + version);
    equal(api('run', {flowSource:written.code,input:input,includeTrace:false}).result, expected, 'written runtime v' + version);
    equal(api('flowSourceValidate', {name:'ReferenceProof', flowSource:written.source,includeHeader:false}).code, written.code, 'stable writer v' + version);
  });
  print('source-expression-references OK (' + checks + ' checks)');
} finally { files.deleteDirectory(project); }
