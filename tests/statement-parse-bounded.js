// A statement written on many lines is parsed in a time that grows with its length, not with its square: the end of
// the statement is tested on its last characters only. A statement longer than the guard is refused with
// FLOWSCRIPT_STATEMENT_TOO_LONG instead of keeping the parser busy.
var engineDir = String(new java.io.File(arguments[0] || '_flow').getCanonicalPath());
var __flowEngineDir = engineDir;
var project = java.nio.file.Files.createTempDirectory('flow-statement-bounded-').toFile();
var __flowProjectDir = String(project.getCanonicalPath());
var FU = Packages.org.apache.commons.io.FileUtils, checks = 0;
function assert(v, m) { checks++; if (!v) throw new Error(m); }
var engine = eval(String(FU.readFileToString(new java.io.File(engineDir, 'Engine.js'), 'UTF-8')));
function check(name, code) { return JSON.parse(engine.flowCodeCheck(JSON.stringify({ name: name, code: code }))); }
function source(name, rows, width) {
	var filler = new Array(width + 1).join('x');
	var lines = ['const _flow = { sourceVersion: 2 }', 'function ' + name + '({ input, result }) {', '  local.items = ['];
	for (var i = 0; i < rows; i++) lines.push('    { code: "ITEM' + i + '", label: "' + filler + '", value: ' + i + ' },');
	lines.push('  ]', '  result.count = local.items.length', '}');
	return lines.join('\n') + '\n';
}
function timed(name, rows) {
	var code = source(name, rows, 20);
	var start = java.lang.System.nanoTime();
	var out = check(name, code);
	assert(out.ok === true, name + ' parses: ' + JSON.stringify(out).substring(0, 300));
	return (java.lang.System.nanoTime() - start) / 1e6;
}

timed('Warmup', 2000);
var small = timed('Small', 2000);
var large = timed('Large', 6000);
// Three times the lines: about three times the time when linear, about nine times when quadratic.
assert(large < 4.5 * small + 500, 'parse time grows linearly: 2000 lines ' + Math.round(small) + ' ms, 6000 lines ' + Math.round(large) + ' ms');

var tooLong = check('TooLong', source('TooLong', 60, 40000));
assert(tooLong.ok === false && JSON.stringify(tooLong).indexOf('FLOWSCRIPT_STATEMENT_TOO_LONG') >= 0,
	'a statement over the guard is refused: ' + JSON.stringify(tooLong).substring(0, 300));

print('statement parse bounded: ' + checks + ' checks ok (2000 lines ' + Math.round(small) + ' ms, 6000 lines ' + Math.round(large) + ' ms)');
