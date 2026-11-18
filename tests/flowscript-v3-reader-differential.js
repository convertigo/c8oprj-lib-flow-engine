// The Java reader (FlowScriptV3Reader) against its oracle, the frozen prototype bridge followed by the v2 parser: the same
// definition, or the same FLOWSCRIPT_V3_* refusal (code and line), or the same parser refusal, on every source of the
// corpus: the specification, the grammar, the rendering cases, the prototype tests, the guides, the probes below, the M1
// samples and the bench revisions (tools/extract-v3-bench-corpus.py, kept out of Git). The only differences allowed are
// the readings the bridge gets wrong (acceptedBeyondBridge), each named by its cause.
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
function complete(body) {
  if (/^\s*(?:const _flow\s*=|function\s)/.test(body)) return body;
  return 'const _flow = { sourceVersion: 3 }\n\nfunction Example({ input, config, result }) {\n' + body.split('\n').map(function (line) { return line ? '  ' + line : line; }).join('\n') + '\n}\n';
}
var grammar = JSON.parse(read('docs/flowscript-v3-grammar.json'));
grammar.accepted.forEach(function (entry) { (entry.examples || []).forEach(function (text, index) { add('grammar:' + entry.id + '#' + index, complete(text)); }); });
grammar.refused.forEach(function (entry) { if (entry.example && !entry.parseError) add('grammar:' + entry.code, complete(entry.example)); });
// Probes: the forms whose reading the Java reader aligned on the bridge at the integration (order of declarations and
// refusals, scopes, slots, rethrow, catch without parameter, conditions, keyword ends).
[
  ['const without value', 'const x\nreturn { x }'],
  ['let reads itself', 'let x = 1\nif (input.a) {\n  let y = y + 1\n}\nreturn { x }'],
  ['case scope', 'switch (input.k) {\n  case 1:\n    const label = "one"\n    result.label = label\n    break\n  default:\n    result.label = "other"\n    break\n}'],
  ['switch over a chain', 'switch (input.items.filter(x => x > 1).length) {\n  case 2: result.n = 2; break\n  default: result.n = 0; break\n}'],
  ['destructured chain', 'const { a, b } = input.rows.find(r => r.ok)\nreturn { a, b }'],
  ['destructured slot', 'const { a } = flow.try({ $$try() { result.x = 1 }, $$catch() {} })'],
  ['destructured branch step', 'const { a } = input.ok ? input.rows.find(r => r.ok) : input.other\nreturn { a }'],
  ['while chain', 'let n = 0\nwhile (input.items.some(x => x > n)) {\n  n++\n}\nreturn { n }'],
  ['if lazy chain', 'if (input.ok && input.items.some(x => x > 1)) {\n  result.x = 1\n}'],
  ['if chain and global', 'if (Object.keys(input.o).length > 0 && input.items.length) {\n  result.x = 1\n}'],
  ['else if chain', 'if (input.a) {\n  result.x = 1\n} else if (input.items.find(x => x > 1)) {\n  result.x = 2\n}'],
  ['if includes keys', 'if (Object.keys(input.o).includes(input.k)) {\n  result.x = 1\n}'],
  ['if ternary condition', 'if (input.a ? input.b : input.c) {\n  result.x = 1\n}'],
  ['for of keys', 'const out = json.array({ itemType: { type: "string" } })\nfor (const k of Object.keys(input.o)) {\n  out.push(k)\n}\nreturn { out }'],
  ['for of chain', 'let n = 0\nfor (const x of input.items.filter(v => v > 1).map(v => v * 2)) {\n  n += x\n}\nreturn { n }'],
  ['for of concat', 'let n = 0\nfor (const x of input.a.concat(input.b)) {\n  n += x\n}\nreturn { n }'],
  ['for of find', 'for (const x of input.items.find(v => v)) {\n  result.x = x\n}'],
  ['for of pattern chain', 'let n = 0\nfor (const { v } of input.rows.filter(r => r.ok)) {\n  n += v\n}\nreturn { n }'],
  ['field update', 'const g = { count: 0 }\ng.count++\ng.count--\ng.count++\nreturn { g }'],
  ['result field update', 'result.count = 0\nresult.count++'],
  ['item field update', 'for (const row of input.rows) {\n  row.count++\n}'],
  ['element update', 'const m = {}\nm[input.k]++'],
  ['update undeclared', 'n++'],
  ['slot function', 'let n = 0\nflow.while({ condition: n < 2, $$nodes: function () { n++ } })\nreturn { n }'],
  ['slot arrow', 'let n = 0\nflow.while({ condition: n < 2, $$nodes: () => { n++ } })\nreturn { n }'],
  ['slot arrow expression', 'let n = 0\nflow.while({ condition: n < 2, $$nodes: () => n++ })'],
  ['slot parameter', 'flow.while({ condition: false, $$nodes(x) { result.x = x } })'],
  ['slot declared', 'const r = flow.try({ $$try() { result.x = 1 }, $$catch() { result.x = 2 } })\nresult.r = r'],
  ['slot assigned', 'let r\nr = flow.try({ $$try() { result.x = 1 }, $$catch() {} })\nresult.r = r'],
  ['slot returned', 'return flow.try({ $$try() { local.x = 1 }, $$catch() {} })'],
  ['slot and out', 'const r = flow.try({ $$out: "local.q", $$try() {}, $$catch() {} })'],
  ['slot on a block without slot', 'const t = text.trim({ text: "x", $$nodes() { result.a = 1 } })\nresult.t = t'],
  ['out conflict', 'const t = text.trim({ text: "x", $$out: "local.q" })\nresult.t = t'],
  ['out same', 'const t = text.trim({ text: "x", $$out: "local.t" })\nresult.t = t'],
  ['rethrow', 'try {\n  throw { code: "A", message: "m" }\n} catch (failure) {\n  throw failure\n}'],
  ['rethrow outer', 'try {\n  throw { code: "A", message: "m" }\n} catch (outer) {\n  try {\n    result.x = 1\n  } catch (inner) {\n    throw outer\n  }\n}'],
  ['throw a local', 'const e = { code: "A", message: "m" }\nthrow e'],
  ['throw error field', 'throw { code: "A", message: "m", error: "x" }'],
  ['catch without parameter', 'try {\n  throw { code: "A", message: "m" }\n} catch {\n  result.caught = true\n}'],
  ['catch without parameter and error local', 'let error = 1\ntry {\n  throw { code: "A", message: "m" }\n} catch {\n  result.caught = error\n}'],
  ['catch pattern', 'try {\n  result.x = 1\n} catch ({ code }) {\n  result.code = code\n}'],
  ['nested function', 'function inner({ rows }) { return rows }'],
  ['nested function in if', 'if (input.a) {\n  function inner() {}\n}'],
  ['keyword end in object', 'const total = { min: input.n > 0 ? input.m / 100 : null, max: input.n > 0 ? input.m : true }\nreturn { total }'],
  ['keyword end in push', 'const rows = json.array({ itemType: { type: "object" } })\nrows.push({ a: input.n > 0 ? 1 : null, b: 2 })\nreturn { rows }'],
  ['bare default', 'const v = default(input.a, "b")\nreturn { v }'],
  ['new date', 'const d = new Date()\nreturn { d }'],
  ['sort in place', 'const s = input.items.sort((a, b) => a - b)\nreturn { s }'],
  ['import alias shadowed', 'let ns = 1\nreturn { ns }'],
  ['two labels', 'one: two: result.x = 1'],
  ['const without space', 'const{ a, b } = input.o\nreturn { a, b }'],
  ['multi-line condition', 'if (input.a &&\n    input.b) {\n  result.x = 1\n}'],
  ['multi-line value', 'const x = input.a +\n  input.b\nresult.x = x'],
  ['multi-line object field', 'result.x = {\n  a: input.a +\n    input.b,\n  b: 2\n}'],
  ['multi-line call argument', 'const t = text.trim({ text: input.a\t+\n\t\tinput.b })\nresult.t = t'],
  ['multi-line index', 'result.x = input.items[\n  0\n]'],
  ['blank line in an expression', 'if (input.a &&\n\n  input.b) {\n  result.x = 1\n}'],
  ['comment ending an expression line', 'if (input.a && // first\n    input.b) {\n  result.x = 1\n}'],
  ['comment line in an expression', 'if (input.a &&\n    // note\n    input.b) {\n  result.x = 1\n}'],
  ['string with slashes on several lines', 'if (input.u == "http://x" &&   \n    input.b) {\n  result.x = 1\n}'],
  ['signed numbers', 'const d = date.add({ value: "2026-03-31", months: -1 })\nresult.d = d\nresult.x = -1.5\nresult.y = - 2\nresult.z = [-1, +2, 1e3, 0x1f]\nresult.w = { a: -3 }'],
  ['signed number returned', 'return -1'],
  ['plus number in a block', 'const d = date.add({ value: "2026-03-31", months: +1 })\nresult.d = d'],
  ['dollar brace in quoted values', 'result.a = "cost ${x}"\nresult.b = \'cost ${x}\'\nconst t = text.trim({ text: "v ${input.a}" })\nresult.t = t\nresult.c = { k: "${y}" }\nresult.d = ["${z}", "a\\\\${w}"]'],
  ['dollar brace pushed', 'const rows = json.array({ itemType: { type: "string" } })\nrows.push("p ${q}")\nreturn { rows }'],
  ['dollar brace in a template property', 'throw { code: "X", message: "bad ${v}" }'],
  ['escaped dollar brace in a template', 'result.a = `cost \\${x} ${input.a}`'],
  ['const in sibling blocks', 'if (input.x) {\n  const v = 1\n  result.a = v\n} else {\n  const v = 2\n  result.a = v\n}'],
  ['const in a loop body', 'const total = json.array({ itemType: { type: "integer" } })\nfor (const x of input.items) {\n  const twice = x * 2\n  total.push(twice)\n}\nreturn { total }'],
  ['comment groups', '// a\n\n// b\nlet x = 1\n\n// c\n\nx += 1\n//  indented note  \nresult.x = x\n/* block\n * two lines */\nresult.y = 1\n// end of the body'],
  ['comment ends a block', 'if (input.a) {\n  result.x = 1\n  // done\n} else {\n  // nothing\n\n  result.x = 2\n}'],
  ['blank line opens the body', '\n// first\n\nresult.x = 1\n\nresult.y = 2'],
  ['disabled after a blank line', 'result.a = 1\n\n// @disabled\nresult.b = 2\n// @disabled\n\nresult.c = 3']
].forEach(function (probe) { add('probe:' + probe[0], complete(probe[1])); });
add('probe:namespace import shadowed', 'const _flow = { sourceVersion: 3 }\nconst ns = flow.import("lib")\nfunction Example({ input, config, result }) {\n  let ns = 1\n  return { ns }\n}\n');
add('probe:import module not literal', 'const _flow = { sourceVersion: 3 }\nconst { a } = flow.import(input.m)\nfunction Example({ input, config, result }) {\n  return { a: 1 }\n}\n');
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
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return JSON.stringify(a) === JSON.stringify(b) ? '' : path + ': ' + String(JSON.stringify(a)).substring(0,120) + ' != ' + String(JSON.stringify(b)).substring(0,120);
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
  try {
    var metadata=eval('('+match[1]+')'), slots=[];
    (metadata.slots||[]).forEach(function(slot){ if (slot && typeof slot==='object') { if (slot.name) slots.push(String(slot.name)); (slot.aliases||[]).forEach(function(a){slots.push(String(a));}); } else if (slot) slots.push(String(slot)); });
    return catalogCache[name]=JSON.stringify({props:metadata.properties||{},slots:slots});
  }
  catch(e) { return catalogCache[name]='{}'; }
}
// The readings the bridge gets wrong, where the Java reader keeps the JavaScript meaning (each one is run against Node
// in flowscript-v3-bench-forms.js). Every diagnostic of the oracle has one of these
// causes, and the Java reading is accepted by the engine:
//   - shorthand: an object literal with a shorthand field ({ category }) as the whole value of a push or a put is
//     rewritten by the bridge to "category: local.category" and given twice to the v2 parser ("local.category:
//     local.category");
//   - inline global: a global call as the receiver of a list method (Object.values(o).toSorted(…)) stays an inline
//     object.values({ … }) call for the bridge, which the v2 parser refuses in an expression; the Java reader computes
//     it before, in a hidden local, as for an assignment;
//   - comment line: a // comment on a line of an expression written on several lines, other than its first, stays in
//     the expression for the v2 parser, which refuses it (FLOWSCRIPT_EXPRESSION_UNSUPPORTED); JavaScript ignores it, and
//     the Java reader drops it as the v2 parser drops the comment of a first line.
function bridgeDefect(diagnostic) {
  if (diagnostic && diagnostic.code === 'FLOWSCRIPT_EXPRESSION_UNSUPPORTED' && /\/\/[^\n]*\n/.test(String(diagnostic.expression || ''))) return 'comment line';
  if (!diagnostic || diagnostic.code !== 'INVALID_EXPRESSION') return '';
  var shorthand = /^([\w$.]+): ([\w$.]+)$/.exec(String(diagnostic.expression || ''));
  if (shorthand && shorthand[1] === shorthand[2]) return 'shorthand';
  if (/Unknown expression function: (?:object\.(?:keys|values)|json\.(?:parse|stringify))\b/.test(String(diagnostic.message || ''))) return 'inline global';
  return '';
}
var acceptedBeyondBridge = {};
var checked=0, skipped=0, wanted=0, wantedIds=[], mismatches=[], bySource={};
cases.forEach(function(item) {
  var translated = bridge.translate(item.source), direct = JSON.parse(String(Reader.read(item.source,catalog)));
  var expectedError = translated.diagnostics.length ? translated.diagnostics[0] : null;
  // A refusal of the reader under another code is a check of the v2 parser it mirrors (an unknown slot, an assignment and
  // $$out): it is compared with the refusal of the oracle's parser below.
  var actualError = direct.diagnostics.length && /^FLOWSCRIPT_V3_/.test(direct.diagnostics[0].code) ? direct.diagnostics[0] : null;
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
      var oracleDiagnostics = oracle.diagnostics && oracle.diagnostics.length ? oracle.diagnostics : [oracle.error];
      var causes = oracleDiagnostics.map(bridgeDefect).filter(function (cause, i, all) { return all.indexOf(cause) === i; });
      if (integrated.ok === true && causes.indexOf('') < 0) {
        wanted++; wantedIds.push(item.id + ' (' + causes.join(', ') + ')');
        causes.forEach(function (cause) { acceptedBeyondBridge[cause] = (acceptedBeyondBridge[cause] || 0) + 1; });
      }
      else mismatches.push(item.id + ' parser diagnostic ' + expectedParserCode + ' != ' + actualParserCode);
    }
    checked++;
    return;
  }
  if (direct.diagnostics.length) { mismatches.push(item.id + ' reader refusal ' + direct.diagnostics[0].code + '/' + direct.diagnostics[0].line + ' of an accepted source'); checked++; return; }
  oracle.definition.flow = Object.assign({},oracle.definition.flow||{},{sourceVersion:3});
  var expected = codeService.comparableDefinition(oracle.definition), actual = codeService.comparableDefinition(direct.definition);
  if (expected !== actual) mismatches.push(item.id + ' definition ' + (kind === 'trace' ? difference(JSON.parse(expected),JSON.parse(actual),'root').split(':')[0] + ' (values withheld)' : difference(JSON.parse(expected),JSON.parse(actual),'root')));
  checked++;
});
print('differential corpus ' + JSON.stringify({total:cases.length,bySource:bySource,checked:checked,oracleRejected:skipped,acceptedBeyondBridge:acceptedBeyondBridge,wantedDifferences:wanted,wantedIds:wantedIds,differences:mismatches.length}));
if (mismatches.length) throw new Error('Differential mismatches:\n' + mismatches.slice(0,80).join('\n'));
