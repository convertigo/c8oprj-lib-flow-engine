// Offline witnesses: the diagnostic changes, the catalog and load refusal do not.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir);
var project = java.nio.file.Files.createTempDirectory("out-capture-diagnostic-").toFile();
var __flowProjectDir = String(project);
var files = Packages.org.apache.commons.io.FileUtils;
var failures = [], checks = 0;
function assert(value, message) { checks++; if (!value) failures.push(message); }
function source(body) { return 'const _flow = { sourceVersion: 2 }\nfunction Capture() {\n' + body + '\n}'; }
try {
  files.writeStringToFile(new java.io.File(project, '_flow/blocks/proof/business.block.js'),
    'const _meta = { runtime: "rhino", properties: { out: { kind: "value", type: "string" } } };\n' +
    '(function () { return { run: function (ctx, node) { return ctx.props(node).out; } }; }())', 'UTF-8');
  var engine = eval(String(files.readFileToString(new java.io.File(engineDir, 'Engine.js'), 'UTF-8')));
  function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
  function check(body) { return api('flowSourceValidate', { name: 'Capture', code: source(body) }); }
  ['http.get', 'list.first'].forEach(function (name) {
    var args = name === 'http.get' ? 'url: "https://example.invalid"' : 'items: [1, 2]';
    var body = name + '({ ' + args + ', out: "local.value" })';
    var result = check(body);
    var d = (result.diagnostics || []).filter(function (item) { return item.code === 'UNKNOWN_BLOCK_PROPERTY' && item.property === 'out'; })[0];
    assert(!result.ok && d && d.severity === 'error', name + ': still an error');
    var explicit = d && /before engine 0\.1\.0/.test(d.message) && /assign|assignment/i.test(d.message) && /\$\$out/.test(d.message)
      && /before engine 0\.1\.0/.test(d.next) && /assign|assignment/i.test(d.next) && /\$\$out/.test(d.next)
      && d.hint.indexOf('local.value = ' + name + '(') >= 0 && d.hint.indexOf(name + '({ $$out:') >= 0;
    print(name + ': explicit diagnostic ' + (explicit ? 'PASS' : 'FAIL'));
    assert(explicit, name + ': explicit migration guidance');
    files.writeStringToFile(new java.io.File(project, '_flow/flows/Capture.flow.js'), source(body), 'UTF-8');
    engine.cacheClear();
    var loaded = api('flowCodeGet', { name: 'Capture', draft: false });
    assert(!loaded.ok && loaded.error.code === 'FLOWSCRIPT_CANONICAL_INVALID', name + ': canonical load refusal');
    assert(check(name + '({ ' + args + ', $$out: "local.value" })').ok, name + ': explicit capture');
    assert(check('local.value = ' + name + '({ ' + args + ' })').ok, name + ': assignment capture');
  });
  var business = check('proof.business({ out: "business data" })');
  assert(business.ok, 'declared business out accepted');
  assert(business.definition.nodes[0].props.out === 'business data' && !business.definition.nodes[0].out, 'business out stays business data');
  var other = check('http.get({ url: "https://example.invalid", unknownProperty: 1 })');
  var diagnostic = other.diagnostics.filter(function (d) { return d.property === 'unknownProperty'; })[0];
  assert(diagnostic.message === 'Unknown property unknownProperty for Flow block http.get.', 'other property message unchanged');
  assert(diagnostic.next === 'Use only expected properties, or create/patch a project block if this property is part of a new contract.', 'other property next unchanged');
  print('out-capture-diagnostic: ' + checks + ' checks, ' + failures.length + ' failures');
  if (failures.length) throw new Error(failures.join('; '));
} finally { files.deleteDirectory(project); }
