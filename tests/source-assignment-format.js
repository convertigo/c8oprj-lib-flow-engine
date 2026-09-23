// Canonical v2 captures are assignments; business data and expression semantics stay unchanged.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir);
var project = java.nio.file.Files.createTempDirectory("flow-assignment-format-").toFile();
var __flowProjectDir = String(project);
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + stable(value[key]);
  }).join(',') + '}';
  return JSON.stringify(value);
}
function equal(actual, expected, message) { assert(stable(actual) === stable(expected), message + ': ' + stable(actual)); }
try {
  files.writeStringToFile(new java.io.File(project, "_flow/blocks/proof/echo.block.js"),
    'const _meta = {runtime:"rhino", properties:{out:{kind:"value",type:"string"},id:{kind:"value",type:"string"},"$$out":{kind:"value",type:"string"}}, outputs:{out:{type:"object"}}}\n' +
    '(function(){return {run:function(ctx,node){return ctx.props(node);}}}())', "UTF-8");
  var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
  function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
  var catalog = api("catalog", {detail:"full",includeIcons:false,includePrivate:true,includeInternal:true});
  assert(catalog.ok, "Catalog loading failed");
  var coreBlocks = (catalog.blocks || []).filter(function (block) { return String(block.file || "").indexOf(String(engineDir) + "/blocks/") === 0; });
  assert(coreBlocks.length >= 100, "Core catalog was not audited");
  coreBlocks.forEach(function (block) {
    assert(!(block.props && block.props.out && block.props.out.mode === "write"), "Core result capture is still advertised as business out: " + block.blockId);
  });
  var obsolete = api("flowSourceValidate", {name:"AssignmentProof",code:'const _flow={sourceVersion:2};\nfunction AssignmentProof(){number.add({left:2,right:3,out:"local.sum"})}'});
  assert(!obsolete.ok && JSON.stringify(obsolete).indexOf("UNKNOWN_BLOCK_PROPERTY") !== -1, "Catalog must reject obsolete business capture");
  function check(code) {
    var result = api("flowSourceValidate", { name: "AssignmentProof", code: code });
    assert(result.ok, "Invalid source: " + JSON.stringify(result));
    return result;
  }
  function write(source) {
    var result = api("flowSourceValidate", { name: "AssignmentProof", flowSource: source, includeHeader: false, includeImplicitReturn: false });
    assert(result.ok, "Invalid rendered source: " + JSON.stringify(result));
    return result;
  }
  function run(code) {
    var result = api("run", { flowSource: code, includeTrace: false });
    assert(result.ok, "Runtime failure: " + JSON.stringify(result));
    return result.result;
  }
  function roundtrip(body, expected) {
    var original = 'const _flow={sourceVersion:2};\nfunction AssignmentProof(){\n' + body + '\n}';
    var parsed = check(original), rendered = write(parsed.source), reparsed = check(rendered.code);
    equal(reparsed.definition, parsed.definition, "Assignment changed AST");
    equal(write(reparsed.source).code, rendered.code, "Formatter must be idempotent");
    equal(run(original), expected, "Original result");
    equal(run(rendered.code), expected, "Rendered result");
    return rendered;
  }
  var capture = roundtrip('number.add({$$id:"sum",$$comment:"keep",$$disabled:false,$$out:"local.sum",left:2,right:3})\nresult.sum = local.sum', {sum:5});
  assert(capture.code.indexOf('local.sum = number.add({\n    $$id: "sum",\n    $$comment: "keep",\n    $$disabled: false,\n    left: 2,\n    right: 3,\n  })') !== -1, "Expected multiline assignment: " + capture.code);
  assert(capture.code.indexOf('$$out:') === -1, "Capture leaked into call parameters");
  roundtrip('number.add({$$id:"nested",$$out:"result.nested.sum",left:2,right:3})', {nested:{sum:5}});
  roundtrip('number.add({$$id:"off",$$disabled:true,$$out:"result.sum",left:2,right:3})', {});
  var trimmed = roundtrip('text.trim({$$id:"trim",$$out:"result.trimmed",text:"  hello  "})', {trimmed:"hello"});
  assert(trimmed.code.indexOf('result.trimmed = text.trim({') !== -1, "Known block was mistaken for a JS expression method");
  roundtrip('local.word = "  hello  "\nresult.trimmed = local.word.trim()', {trimmed:"hello"});
  var business = roundtrip('proof.echo({$$id:"echo",$$out:"result.record",id:"business id",out:"business value",$$$out:"escaped business"})', {record:{id:"business id",out:"business value","$$out":"escaped business"}});
  assert(business.code.indexOf('result.record = proof.echo({') !== -1 && business.code.indexOf('out: "business value"') !== -1 && business.code.indexOf('$$$out: "escaped business"') !== -1, "Business fields were confused with capture");
  var slots = roundtrip('json.object({$$id:"object",$$out:"result.record",$$fields:function(){json.field({$$id:"field",key:"sum",value:2+3})}})', {record:{sum:5}});
  assert(slots.code.indexOf('result.record = json.object({') !== -1 && slots.code.indexOf('$$fields: function () {') !== -1, "Capture with slot changed");
  var expressions = roundtrip('local.sum = 2 + 3\nif (2 < 3) {\nresult.sum = local.sum\n}\nresult.text = "a" + 3', {sum:5,text:"a3"});
  assert(expressions.definition.nodes[0].block === "set" && expressions.definition.nodes[1].block === "if", "Expressions must not lower to arithmetic/comparison blocks");
  assert(expressions.code.indexOf('number.add') === -1 && expressions.code.indexOf('compare.') === -1, "Expression lowering introduced");
  var edited = api("applyMutation", {target:"flow",flowSource:capture.code,mutation:{op:"replace",path:"/nodes/0/props/left",value:4}});
  assert(edited.ok, "Mutation failed: " + JSON.stringify(edited));
  var editedCode = write(check(edited.source).source).code;
  equal(editedCode, capture.code.replace('    left: 2,', '    left: 4,'), "Single-property mutation should change one line");
  equal(run(editedCode), {sum:7}, "Edited assignment result");
  print("source-assignment-format OK (" + checks + " checks)");
} finally { files.deleteDirectory(project); }
