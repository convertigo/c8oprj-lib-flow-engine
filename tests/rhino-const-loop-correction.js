var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-rhino-const-loop-").toFile().getCanonicalFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	var lines = [
		'const _meta = {runtime:"rhino",description:"Loop test.",outputs:{out:{type:"object"}}}',
		'(function () { return { run: function () {',
		'  const outside = 7;',
		'  var out = {classic:[], nested:[], of:[], insideOf:[], keys:[], insideIn:[], while:[], doWhile:[], callbacks:[], arrows:[]};',
		'  var i = 0; for (;;) { if (i === 3) break; const a = i * 2; out.classic.push(a); if (i > 0) { const b = i + 10; out.nested.push(b); } i++; }',
		'  for (const value of [1, 2, 3]) { const c = value * 3; out.of.push(value); out.insideOf.push(c); }',
		'  for (const key in {a: 1, b: 2}) { const d = key + "!"; out.keys.push(key); out.insideIn.push(d); }',
		'  var w = 0; while (w < 3) { const e = ++w; out.while.push(e); }',
		'  var counter = 0; do { const f = ++counter * 4; out.doWhile.push(f); } while (counter < 3);',
		'  [1, 2].forEach(function (x) { const keep = x + outside; out.callbacks.push(keep); });',
		'  [1, 2].forEach(x => { const arrow = x + outside; out.arrows.push(arrow); });',
		'  const message = "const in a string"; // const in a comment',
		'  const template = `const in a template`;',
		'  out.untouched = [outside, message, template]; return out;',
		'} }; }())'
	];
	var source = lines.join('\n');
	var request = {projectDir: __flowProjectDir, name: 'proof.loop', code: source, dry: true};
	var dry = api('blockCodeSet', request);
	assert(dry.ok, 'dry compile: ' + JSON.stringify(dry.error));
	var expected = [5, 5, 6, 6, 7, 7, 8, 9];
	assert(dry.fixes.length === expected.length, 'fix count: ' + JSON.stringify(dry.fixes));
	assert(dry.fixes.every(function (fix, i) { return fix.line === expected[i] && fix.before === 'const' && fix.after === 'let' && fix.code === 'RHINO_CONST_IN_LOOP_CORRECTED'; }), 'fixes: ' + JSON.stringify(dry.fixes));
	assert(dry.warnings.some(function (warning) { return warning.code === 'RHINO_CONST_IN_LOOP_CORRECTED'; }), 'warning missing');
	assert(dry.code.indexOf('const outside') >= 0 && dry.code.indexOf('const keep') >= 0 && dry.code.indexOf('const arrow') >= 0, 'function boundary or outside declaration changed');
	assert(dry.code.indexOf('"const in a string"; // const in a comment') >= 0 && dry.code.indexOf('`const in a template`') >= 0, 'literal or comment changed');
	var saved = api('blockCodeSet', Object.assign({}, request, {dry: false}));
	assert(saved.ok && saved.fixes.length === expected.length && saved.warnings.some(function (warning) { return warning.code === 'RHINO_CONST_IN_LOOP_CORRECTED'; }), 'write response: ' + JSON.stringify(saved.error));
	assert(String(files.readFileToString(new java.io.File(String(saved.codeFile)), 'UTF-8')) === dry.code, 'saved source differs from correction');
	var legacy = api('blockCreate', {projectDir: __flowProjectDir, name: 'proof.legacy',
		descriptor: {description: 'Legacy write.', implementation: {runtime: 'rhino'}}, implementationSource: lines.slice(1).join('\n')});
	assert(legacy && !legacy.error, 'legacy blockCreate: ' + JSON.stringify(legacy));
	var legacyFile = new java.io.File(project, '_flow/blocks/proof/legacy.block.js');
	assert(legacyFile.isFile() && String(files.readFileToString(legacyFile, 'UTF-8')).indexOf('for (let value of') >= 0,
		'legacy writer did not compile the corrected source');
	// The legacy writer applies the Rhino policy before writing any file, whatever the request says.
	var refused = api('blockCreate', {projectDir: __flowProjectDir, name: 'proof.refused', allowPrimitiveRhino: true,
		descriptor: {description: 'Refused write.', implementation: {runtime: 'rhino'}, hooks: {file: 'refused.hooks.js'}},
		hooksSource: '(function () { return {}; }())',
		implementationSource: '(function () { return { run: function () { return new java.net.URL("http://example.invalid").openStream(); } }; }())'});
	assert(refused && refused.error && refused.error.code === 'RHINO_REIMPLEMENTS_HTTP', 'legacy policy: ' + JSON.stringify(refused));
	assert(!new java.io.File(project, '_flow/blocks/proof/refused.block.js').exists() &&
		!new java.io.File(project, '_flow/blocks/proof/refused.hooks.js').exists(), 'a refused legacy write left a file');
	var flow = 'const _flow={sourceVersion:2}\nfunction Check({result}) { proof.loop({$$out:"result.out"}) }';
	var run = api('run', {projectDir: __flowProjectDir, flowSource: flow, flowName: 'Check', flowQName: 'Proof.Check'});
	assert(run.ok, 'execution: ' + JSON.stringify(run.error));
	var value = run.result.out;
	assert(JSON.stringify(value.classic) === '[0,2,4]' && JSON.stringify(value.nested) === '[11,12]', 'classic/nested: ' + JSON.stringify(value));
	assert(JSON.stringify(value.of) === '[1,2,3]' && JSON.stringify(value.insideOf) === '[3,6,9]', 'for-of: ' + JSON.stringify(value));
	assert(JSON.stringify(value.keys) === '["a","b"]' && JSON.stringify(value.insideIn) === '["a!","b!"]', 'for-in: ' + JSON.stringify(value));
	assert(JSON.stringify(value.while) === '[1,2,3]' && JSON.stringify(value.doWhile) === '[4,8,12]', 'while/do: ' + JSON.stringify(value));
	assert(JSON.stringify(value.callbacks) === '[8,9]' && JSON.stringify(value.arrows) === '[8,9]', 'callbacks: ' + JSON.stringify(value));
	assert(JSON.stringify(value.untouched) === '[7,"const in a string","const in a template"]', 'untouched: ' + JSON.stringify(value));
	print('Rhino const loop correction OK (' + checks + ' checks)');
} finally { files.deleteDirectory(project); }
