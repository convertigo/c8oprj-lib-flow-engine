// Formatting contract: actual Rhino parsing, Engine round-trip and execution.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-format-contract-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function equal(actual, expected, message) { assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual)); }
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + stable(value[key]);
  }).join(',') + '}';
  return JSON.stringify(value);
}
try {
  var renderer = eval(read(new java.io.File(engineDir, "modules/flow-script-renderer-service.js")));
  var fixtures = JSON.parse(read(new java.io.File(engineDir, "../tests/fixtures/source-format-data.json")));
  var env = { sourceVersion: 2, normalizeTree: function (value) { return JSON.parse(JSON.stringify(value)); } };
  fixtures.forEach(function (fixture) {
    var text = renderer.flowScriptInlineValue(fixture.value, env);
    equal(text, fixture.expected.join("\n"), fixture.name + " golden");
    var parsed = eval("(" + text + ")");
    equal(parsed, fixture.value, fixture.name + " Rhino literal");
    equal(renderer.flowScriptInlineValue(parsed, env), text, fixture.name + " stable");
    var nested = renderer.flowScriptInlineValue(fixture.value, env, "    ");
    equal(nested, fixture.expected.map(function (line, index) { return index ? "    " + line : line; }).join("\n"), fixture.name + " nested indent");
  });
  var engine = eval(read(new java.io.File(engineDir, "Engine.js")));
  function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
  function validate(code) {
    var result = api("flowSourceValidate", { name: "FormatProof", code: code });
    assert(result.ok, "Parse failed: " + JSON.stringify(result.diagnostics));
    return result;
  }
  function write(source) {
    var result = api("flowSourceValidate", { name: "FormatProof", flowSource: source, includeHeader: false, includeImplicitReturn: false });
    assert(result.ok, "Write failed: " + JSON.stringify(result));
    return result;
  }
  function run(code) {
    var result = api("run", { flowSource: code, input: { name: "Ada" }, includeTrace: false });
    assert(result.ok, "Runtime failed: " + JSON.stringify(result));
    return result.result;
  }
  var code = 'const _flow={sourceVersion:2};\nfunction FormatProof(){\nset({$$id:"capture",$$comment:"Keep",$$disabled:false,path:"result.row",value:{z:0,a:false,empty:"",nil:null,rows:[{id:5}],label:"Hi {{ input.name }}\\n  preserved"}})\n}';
  var before = validate(code);
  var written = write(before.source);
  var expectedCall = [
    '  set({', '    $$id: "capture",', '    $$comment: "Keep",', '    $$disabled: false,',
    '    path: "result.row",', '    value: {', '      z: 0,', '      a: false,',
    '      empty: "",', '      nil: null,', '      rows: [', '        {', '          id: 5,',
    '        },', '      ],', '      label: "Hi {{ input.name }}\\n  preserved",', '    },', '  })'
  ].join("\n");
  assert(written.code.indexOf(expectedCall) !== -1, "Call layout changed:\n" + written.code);
  equal(written.definition, before.definition, "AST changed");
  equal(run(written.code), run(code), "Runtime changed");
  equal(write(written.source).code, written.code, "Whole writer not idempotent");
  assert(written.code.slice(-1) === "\n" && written.code.indexOf("\r") === -1, "Expected LF and final newline");
  var changed = api("applyMutation", { target: "flow", flowSource: written.code,
    mutation: { op: "replace", nodeId: "capture", property: "value", value: {
      z: 1, a: false, empty: "", nil: null, rows: [{id:5}], label: "Hi {{ input.name }}\n  preserved"
    } } });
  assert(changed.ok, "Mutation failed: " + JSON.stringify(changed));
  var changedCode = write(validate(changed.source).source).code;
  equal(changedCode, written.code.replace("      z: 0,", "      z: 1,"), "One-property edit should change only one line");
  var slots = 'const _flow={sourceVersion:2};\nfunction FormatProof(){\nif({$$id:"choice",condition:true,$$then:function(){set({$$id:"yes",path:"result.ok",value:true})},$$else:function(){set({$$id:"no",path:"result.ok",value:false})}})\n}';
  var slotWritten = write(validate(slots).source);
  assert(slotWritten.code.indexOf('    $$then: function () {\n      set({\n') !== -1, "Slot indentation");
  equal(run(slotWritten.code), { ok: true }, "Trailing slot commas changed execution");
  equal(write(slotWritten.source).code, slotWritten.code, "Slots not stable");
  var legacy = 'function FormatProof(){set({id:"capture",path:"result.value",value:5})}';
  var oldWritten = write(validate(legacy).source);
  assert(oldWritten.code.indexOf('  result.value = 5\n') !== -1, "Legacy assignment writer was reformatted: " + oldWritten.code);
  equal(renderer.flowScriptInlineValue(fixtures[0].value, Object.assign({}, env, { sourceVersion: 1 })),
    JSON.stringify(fixtures[0].value), "Legacy data writer was reformatted");
  // Splitting a property at ':' must not trim/rejoin later ternary colons.
  // Exercise both call properties and natural return-object fields.
  [1, 2].forEach(function (version) {
    var marker = version === 2 ? '$$id' : 'id';
    var header = 'const _flow={sourceVersion:' + version + '};\n';
    var ternary = 'input.name ? true ? "a:b" : "no" : "empty"';
    [
      'var selected = ' + ternary + '\nset({' + marker + ':"value",path:"result.value",value:selected})',
      'set({' + marker + ':"value",path:"result.value",value:{"key:colon":' + ternary + ',nested:[{label:' + ternary + '}]}})',
      'return {"key:colon":' + ternary + '}'
    ].forEach(function (body) {
      var input = header + 'function FormatProof(){\n' + body + '\n}';
      var parsed = validate(input), output = write(parsed.source);
      assert(JSON.stringify(parsed.definition).indexOf(' : ') !== -1, 'Parser lost ternary spacing');
      equal(stable(output.definition), stable(parsed.definition), 'Ternary AST changed from ' + stable(parsed.definition));
      equal(run(output.code), run(input), 'Ternary runtime changed');
      equal(write(output.source).code, output.code, 'Ternary writer not stable');
    });
  });
  [
    { body: 'if (input.name) {\nvar selected = "yes"\nresult.value = selected\n}', expected: {value:'yes'} },
    { body: 'set({$$id:"localWrite",path:"local.selected",value:"yes"})\nresult.value = selected', expected: {value:'yes'} },
    { body: 'var names = list.map({items:[" a "," b "],select:text.trim({text:current})})\nresult.names = names', expected: {names:['a','b']} }
  ].forEach(function (fixture) {
    var input = 'const _flow={sourceVersion:2};\nfunction FormatProof(){\n' + fixture.body + '\n}';
    var parsed = validate(input), output = write(parsed.source);
    equal(stable(output.definition), stable(parsed.definition), 'Synthesized AST changed');
    equal(run(input), fixture.expected, 'Synthesized nodes runtime');
    equal(run(output.code), fixture.expected, 'Synthesized nodes writer runtime');
    equal(write(output.source).code, output.code, 'Synthesized nodes writer not stable');
  });
  print("source-format-contract OK (" + checks + " checks)");
} finally { files.deleteDirectory(project); }
