// Same boundary/value corpus in Rhino and the frontend provider; never eval metadata.
var root = new java.io.File(arguments[0] || '_flow').getCanonicalFile();
var __flowEngineDir = String(root.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory('flow-portable-meta-').toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
function read(path) { return String(files.readFileToString(new java.io.File(root, path), 'UTF-8')); }
var checks = 0;
function assert(ok, message) { checks++; if (!ok) throw new Error(message); }
try {
  var engine = eval(read('Engine.js'));
  var parser = eval(read('modules/flow-script-parser-service.js'));
  var reader = eval(read('modules/block-code-source-service.js'));
  var env = {
    raise: function (code, message) { var error = new Error(message); error.code = code; throw error; },
    parseFlowScriptMetadataValue: function (text, line) { return parser.parseFlowScriptMetadataValue(text, line, env); }
  };
  var corpus = JSON.parse(read('../../tests/fixtures/portable-metadata-headers.json'));
  corpus.valid.forEach(function (item) {
    var actual = reader.extractMeta(item.source, env);
    assert(JSON.stringify(actual.meta) === JSON.stringify(item.meta), 'Header changed: ' + item.source);
    assert(actual.code.split('\n').length === item.source.split('\n').length, 'Header removal shifted body lines');
    if (item.source.indexOf('function Demo') >= 0) {
      assert(actual.code.indexOf('function Demo') === item.source.indexOf('function Demo'), 'Body offsets shifted');
    }
  });
  corpus.invalid.forEach(function (source) {
    var failed = false;
    try { reader.extractMeta(source, env); } catch (error) { failed = /METADATA|DUPLICATE_PROPERTY/.test(error.code); }
    assert(failed, 'Invalid portable header accepted: ' + source);
  });
  var values = JSON.parse(read('../../tests/fixtures/source-metadata-values.json'));
  values.valid.forEach(function (item) {
    var actual = reader.extractMeta('const _meta={value:' + item.source + '};\nfunction Demo(){}', env);
    assert(JSON.stringify(actual.meta.value) === JSON.stringify(item.value), 'Value changed: ' + item.source);
  });
  values.invalid.forEach(function (value) {
    var failed = false;
    try { reader.extractMeta('const _meta={value:' + value + '};\nfunction Demo(){}', env); } catch (error) { failed = true; }
    assert(failed, 'Invalid value accepted: ' + value);
  });
  var block = "// const _meta={runtime:'wrong'}\nconst _meta={sourceVersion:2, properties:{id:{kind:'value',type:'number'}},outputs:{out:{type:'number'}}};\nfunction Echo({input}){return input.id;}";
  var saved = JSON.parse(engine.blockCodeSet(JSON.stringify({name:'proof.header', code:block})));
  assert(saved.ok, 'Block authoring rejected a commented static header: ' + JSON.stringify(saved));
  var run = JSON.parse(engine.run(JSON.stringify({flowSource:'const _flow={sourceVersion:2}\nfunction Proof(){proof.header({id:5,$$out:"result.id"})}', includeTrace:false})));
  assert(run.ok && run.result.id === 5, 'Runtime lost business id: ' + JSON.stringify(run));
  var before = JSON.parse(engine.blockCodeGet(JSON.stringify({name:'proof.header'})));
  var invalid = JSON.parse(engine.blockCodeSet(JSON.stringify({name:'proof.header',code:'const _meta=input;\nfunction Echo(){return 1;}'})));
  var after = JSON.parse(engine.blockCodeGet(JSON.stringify({name:'proof.header'})));
  assert(!invalid.ok && before.revision === after.revision, 'Invalid header altered the persisted block');
  print('portable-metadata-headers OK (' + checks + ' checks)');
} finally { files.deleteDirectory(project); }
