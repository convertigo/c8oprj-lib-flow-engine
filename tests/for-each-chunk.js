// forEachChunk: chunks of an array, a fresh local per chunk with parent for the caller scope, emit into a result field,
// return and reduce, onError, the FlowScript writer and the palette.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir);
var project = java.nio.file.Files.createTempDirectory("for-each-chunk-").toFile();
var __flowProjectDir = String(project);
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function read(path) { return String(files.readFileToString(new java.io.File(engineDir, path), "UTF-8")); }
try {
  var engine = eval(read("Engine.js"));
  function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
  function run(code, input) {
    var parsed = api("flowSourceValidate", {code: code});
    assert(parsed.ok, "The source parses: " + JSON.stringify(parsed.error));
    var written = api("flowSourceValidate", {flowSource: parsed.source});
    assert(written.ok, "The source is written back: " + JSON.stringify(written.error));
    var answer = api("run", {flowSource: written.code, input: input || {}, includeTrace: false});
    return {parsed: parsed, written: written, answer: answer};
  }
  var items = [];
  for (var i = 1; i <= 7; i++) items.push({id: i, name: "n" + i, score: i * 3 % 7});

  // fresh local per chunk, parent for the caller's counters, emit into result.data, the block summary
  var counted = run('const _flow={sourceVersion:2,inputs:{items:{type:"array"}}}\nfunction Counted({input,result}){\n'
    + 'local.total=0\nlocal.seen=0\n'
    + 'local.summary=forEachChunk({source:input.items,size:3,into:"data",$$each:function({chunk}){\n'
    + 'local.before=local.count\nlocal.count=chunk.rows.length\n'
    + 'parent.total=parent.total+local.count\nparent.seen=parent.seen+(local.before===undefined?1:0)\n'
    + 'local.selected=rows.select({rows:chunk.rows,columns:["id"]})\nemit({rows:local.selected})\n'
    + '}})\nresult.total=local.total\nresult.fresh=local.seen\nresult.chunks=local.summary.chunks\nresult.rows=local.summary.rows\n}', {items: items});
  var r = counted.answer;
  assert(r.ok, "The chunked Flow runs: " + JSON.stringify(r.error));
  assert(r.result.total === 7 && r.result.chunks === 3 && r.result.rows === 7, "Chunks of 3 rows, counted in parent: " + JSON.stringify(r.result));
  assert(r.result.fresh === 3, "Each chunk starts with an empty local");
  assert(JSON.stringify(r.result.data) === JSON.stringify(items.map(function (x) { return {id: x.id}; })), "emit appends to result.data in order without a stream: " + JSON.stringify(r.result.data));
  assert(counted.written.code.indexOf("$$each: function ({chunk}) {") >= 0, "The writer declares the slot variable: " + counted.written.code);
  var again = api("flowSourceValidate", {code: counted.written.code});
  var rewritten = again.ok && api("flowSourceValidate", {flowSource: again.source});
  assert(rewritten && rewritten.code === counted.written.code, "The written source parses back to the same source");

  // return gives the value of a chunk, reduce combines them: the best row of all
  var best = run('const _flow={sourceVersion:2,inputs:{items:{type:"array"}}}\nfunction Best({input,result}){\n'
    + 'local.best=forEachChunk({source:input.items,size:2,$$each:function({chunk}){\n'
    + 'local.sorted=list.sort({items:chunk.rows,by:current.score,direction:"desc"})\nreturn local.sorted[0]\n'
    + '},$$reduce:function({acc,value}){\n'
    + 'if({condition:acc===null || value.score>acc.score,$$then:function(){return value},$$else:function(){return acc}})\n'
    + '}})\nresult.best=local.best\n}', {items: items});
  assert(best.answer.ok, "Map and reduce run: " + JSON.stringify(best.answer.error));
  assert(best.answer.result.best && best.answer.result.best.score === 6, "The reduce keeps the best row: " + JSON.stringify(best.answer.result));
  assert(best.written.code.indexOf("$$reduce: function ({acc, value}) {") >= 0, "The reduce slot declares acc and value: " + best.written.code);

  // onError continue counts the failed chunk and goes on; stop ends the Flow
  var tolerant = run('const _flow={sourceVersion:2,inputs:{items:{type:"array"}}}\nfunction Tolerant({input,result}){\n'
    + 'local.done=0\nlocal.summary=forEachChunk({source:input.items,size:3,onError:"continue",$$each:function({chunk}){\n'
    + 'if({condition:chunk.index===1,$$then:function(){throw({code:"BAD_CHUNK",message:"bad chunk"})}})\n'
    + 'parent.done=parent.done+chunk.rows.length\n}})\nresult.done=local.done\nresult.errors=local.summary.errors\n}', {items: items});
  assert(tolerant.answer.ok && tolerant.answer.result.done === 4, "The failed chunk is skipped: " + JSON.stringify(tolerant.answer));
  assert(tolerant.answer.result.errors.length === 1 && tolerant.answer.result.errors[0].index === 1, "The failure is counted with its chunk");
  var strict = run(tolerant.written.code.replace(/onError: "continue",\s*/, ""), {items: items});
  assert(!strict.answer.ok && JSON.stringify(strict.answer.error).indexOf("BAD_CHUNK") >= 0, "By default the error ends the Flow");

  // last, empty source, emit outside a forEachChunk with into
  var last = run('const _flow={sourceVersion:2,inputs:{items:{type:"array"}}}\nfunction Last({input,result}){\n'
    + 'result.last=-1\nforEachChunk({source:input.items,size:4,$$each:function({chunk}){\n'
    + 'if({condition:chunk.last,$$then:function(){result.last=chunk.index}})\n}})\n}', {items: items});
  assert(last.answer.ok && last.answer.result.last === 1, "chunk.last marks the last chunk");
  var empty = run(last.written.code, {items: []});
  assert(empty.answer.ok && empty.answer.result.last === -1, "An empty source runs no chunk");
  var outside = run('const _flow={sourceVersion:2}\nfunction Outside({result}){\nemit({rows:[1]})\n}');
  assert(!outside.answer.ok && JSON.stringify(outside.answer.error).indexOf("EMIT_OUTSIDE_FOR_EACH_CHUNK") >= 0, "emit needs a forEachChunk with into");

  // the analysis reports emit outside a forEachChunk with into, not inside one
  var checked = api("analyze", {flowSource: outside.written.code});
  assert(checked.ok && checked.errors.some(function (error) { return error.code === "EMIT_OUTSIDE_FOR_EACH_CHUNK"; }), "Analysis rejects emit outside: " + JSON.stringify(checked.errors));
  var noInto = api("analyze", {flowSource: counted.written.code.replace(/into: "data",\s*/, "")});
  assert(noInto.ok && noInto.errors.some(function (error) { return error.code === "EMIT_OUTSIDE_FOR_EACH_CHUNK"; }), "Analysis rejects emit without into");
  var inside = api("analyze", {flowSource: counted.written.code});
  assert(inside.ok && !inside.errors.some(function (error) { return error.code === "EMIT_OUTSIDE_FOR_EACH_CHUNK"; }), "Analysis accepts emit inside: " + JSON.stringify(inside.errors));

  // pickers: in the Each slot, chunk.* to read and parent.* to write; neither outside the loop
  var picked = api("flowSourceValidate", {code: 'const _flow={sourceVersion:2,inputs:{items:{type:"array"}}}\nfunction Picked({input,result}){\n'
    + 'local.total=0\nforEachChunk({source:input.items,size:3,$$each:function({chunk}){\n'
    + 'number.add({$$id:"inner",left:1,right:2,$$out:"local.sum"})\n}})\nnumber.add({$$id:"after",left:1,right:2,$$out:"result.sum"})\n}'});
  assert(picked.ok, "The picker Flow parses: " + JSON.stringify(picked.error));
  var innerWrite = api("context", {flowSource: picked.source, node: "inner", property: "$$out"});
  assert(innerWrite.ok && innerWrite.include.indexOf("parent") >= 0, "parent is a destination in the slot: " + JSON.stringify(innerWrite.include));
  assert(innerWrite.scopes.parent.paths.some(function (entry) { return entry.path === "parent.total"; }), "parent offers the caller locals: " + JSON.stringify(innerWrite.scopes.parent));
  var innerRead = api("context", {flowSource: picked.source, node: "inner", property: "left"});
  var chunkPaths = (innerRead.scopes.chunk && innerRead.scopes.chunk.paths || []).map(function (entry) { return entry.path + ":" + (entry.schema && entry.schema.type || entry.type); });
  assert(innerRead.ok && chunkPaths.indexOf("chunk.rows:array") >= 0 && chunkPaths.indexOf("chunk.index:integer") >= 0 && chunkPaths.indexOf("chunk.last:boolean") >= 0,
    "chunk offers its typed fields to read: " + JSON.stringify(innerRead.scopes.chunk));
  var afterWrite = api("context", {flowSource: picked.source, node: "after", property: "$$out"});
  assert(afterWrite.ok && afterWrite.include.indexOf("parent") < 0, "parent is not a destination after the loop: " + JSON.stringify(afterWrite.include));
  var afterRead = api("context", {flowSource: picked.source, node: "after", property: "left"});
  assert(!(afterRead.scopes.chunk && afterRead.scopes.chunk.paths || []).some(function (entry) { return entry.path === "chunk.rows"; }), "chunk is not offered after the loop: " + JSON.stringify(afterRead.scopes.chunk));

  var palette = api("blockGet", {name: "forEachChunk", detail: "full"});
  var descriptor = palette.block || palette.descriptor || palette;
  assert(descriptor.slots && descriptor.slots[0].name === "each" && JSON.stringify(descriptor.slots[0].params) === '["chunk"]', "The palette carries the slot variables: " + JSON.stringify(descriptor.slots));
  print("forEachChunk OK (" + checks + " checks)");
} finally { files.deleteDirectory(project); }
