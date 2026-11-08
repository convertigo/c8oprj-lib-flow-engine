var engineDir = new java.io.File(arguments.length ? arguments[0] : '_flow').getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory('unknown-expression-hint-').toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;

function assert(condition, message) { if (!condition) throw new Error(message); }

try {
  var engine = eval(String(files.readFileToString(new java.io.File(engineDir, 'Engine.js'), 'UTF-8')));
  function failed(nodes) {
    var out = JSON.parse(engine.run(JSON.stringify({
      definition: { flow: { sourceVersion: 2 }, nodes: nodes },
      input: { rows: [{ title: 'Ada' }] }, includeTrace: false
    })));
    assert(out.ok === false && out.error && out.error.code === 'INVALID_EXPRESSION', JSON.stringify(out));
    return out.error;
  }

  var inIteration = failed([{ block: 'list.map', props: { items: 'input.rows', select: 'title' }, out: 'result.titles' }]);
  assert(inIteration.message === 'Unknown expression identifier: title', JSON.stringify(inIteration));
  assert(inIteration.hint.indexOf('current.title') !== -1, JSON.stringify(inIteration));

  var withLocal = failed([
    { block: 'set', props: { path: 'local.title', value: 'Ada' } },
    { block: 'list.map', props: { items: 'title', select: 'current' }, out: 'result.titles' }
  ]);
  assert(withLocal.hint.indexOf('local.title') !== -1 && withLocal.hint.indexOf('current.') === -1,
    JSON.stringify(withLocal));

  var unknown = failed([{ block: 'list.map', props: { items: 'title', select: 'current' }, out: 'result.titles' }]);
  assert(/quote/i.test(unknown.hint) && unknown.hint.indexOf('current.') === -1, JSON.stringify(unknown));
  print('unknown expression runtime hint tests passed');
} finally {
  files.deleteDirectory(project);
}
