// forEachChunk with parallel: the contract of the lanes on the calling thread (no shared runtime here, so the chunks run
// one by one): same result as parallel 1 whatever the reduce, read-only scopes of the caller in both slots, own handles
// only, blocks needing the Convertigo context refused, errors in chunk order, nesting, composite blocks keeping their
// own result. The real threads are proved by the engine test FlowParallelChunksTest.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir);
var project = java.nio.file.Files.createTempDirectory("for-each-chunk-parallel-").toFile();
var __flowProjectDir = String(project);
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function read(path) { return String(files.readFileToString(new java.io.File(engineDir, path), "UTF-8")); }
try {
  var engine = eval(read("Engine.js"));
  function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
  function source(code) {
    var parsed = api("flowSourceValidate", {code: code});
    assert(parsed.ok, "The source parses: " + JSON.stringify(parsed.error || parsed.errors));
    var written = api("flowSourceValidate", {flowSource: parsed.source});
    assert(written.ok, "The source is written back: " + JSON.stringify(written.error));
    return written;
  }
  function run(code, input) { return api("run", {flowSource: source(code).code, input: input || {}, includeTrace: false}); }
  function code(error) { return error && (error.code || error.error && error.error.code) || JSON.stringify(error); }
  var items = [];
  for (var i = 1; i <= 23; i++) items.push({id: i, score: i * 7 % 11});
  var head = 'const _flow={sourceVersion:2,inputs:{items:{type:"array"}}}\n';

  // a reduce that depends on the order (a list of the chunk indexes) and a sum reading parent: same with 1 and 4 lanes
  function folded(parallel, ordered) {
    return head + 'function Fold({input,result}){\nlocal.factor=10\n'
      + 'local.text=forEachChunk({source:input.items,size:3,parallel:' + parallel + (ordered ? ',ordered:true' : '') + ',into:"data",$$each:function({chunk}){\n'
      + 'local.ids=rows.select({rows:chunk.rows,columns:["id"]})\nemit({rows:local.ids})\nlocal.i="{{ chunk.index }}"\nreturn local.i\n'
      + '},$$reduce:function({acc,value}){\nif({condition:acc===null,$$then:function(){return value}})\nlocal.t="{{ acc }},{{ value }}"\nreturn local.t\n}})\n'
      + 'local.sum=forEachChunk({source:input.items,size:5,parallel:' + parallel + ',$$each:function({chunk}){\n'
      + 'local.before=local.count\nlocal.count=chunk.rows.length\nreturn local.before===undefined?local.count*parent.factor:-1000\n'
      + '},$$reduce:function({acc,value}){\nreturn acc===null?value:acc+value\n}})\n'
      + 'local.summary=forEachChunk({source:input.items,size:4,parallel:' + parallel + ',$$each:function({chunk}){\nlocal.x=chunk.index\n}})\n'
      + 'result.text=local.text\nresult.sum=local.sum\nresult.summary=local.summary\n}';
  }
  var one = run(folded(1), {items: items}), four = run(folded(4), {items: items}), ordered = run(folded(4, true), {items: items});
  assert(one.ok && four.ok && ordered.ok, "The folded Flows run: " + JSON.stringify([one.error, four.error, ordered.error]));
  assert(one.result.text === "0,1,2,3,4,5,6,7", "The sequential fold keeps the chunk order: " + one.result.text);
  assert(four.result.text === one.result.text && ordered.result.text === one.result.text, "The parallel fold equals the sequential one: " + four.result.text);
  assert(four.result.sum === 230 && one.result.sum === 230, "A fresh local per chunk and parent read in parallel: " + JSON.stringify([one.result.sum, four.result.sum]));
  assert(JSON.stringify(four.result.data) === JSON.stringify(one.result.data) && four.result.data.length === 23, "emit keeps the chunk order: " + JSON.stringify(four.result.data));
  assert(JSON.stringify(four.result.summary) === JSON.stringify({chunks: 6, rows: 23, errors: []}), "The summary of a parallel loop: " + JSON.stringify(four.result.summary));
  var written = source(folded(4, true)).code;
  assert(written.indexOf("parallel: 4") > 0 && written.indexOf("ordered: true") > 0, "The writer keeps parallel and ordered: " + written);

  // parent, result and input are read-only in both slots of a parallel loop, writable in sequence
  function writes(parallel, statement, slot) {
    return run(head + 'function Writes({input,result}){\nlocal.total=0\nlocal.out=forEachChunk({source:input.items,size:5,parallel:' + parallel + ',$$each:function({chunk}){\n'
      + (slot === "each" ? statement + '\n' : '') + 'return chunk.rows.length\n},$$reduce:function({acc,value}){\n'
      + (slot === "reduce" ? statement + '\n' : '') + 'return acc===null?value:acc+value\n}})\nresult.total=local.total\nresult.out=local.out\n}', {items: items});
  }
  var sequentialParent = writes(1, "parent.total=parent.total+1", "each");
  assert(sequentialParent.ok && sequentialParent.result.total === 5, "parent is writable in sequence: " + JSON.stringify(sequentialParent));
  [["parent.total=parent.total+1", "each"], ["result.seen=chunk.index", "each"],
    ["parent.total=1", "reduce"], ["result.acc=acc", "reduce"], ["number.add({left:1,right:2,$$out:\"parent.sum\"})", "each"]].forEach(function (pair) {
    var refused = writes(3, pair[0], pair[1]);
    assert(!refused.ok && code(refused.error) === "PARALLEL_SCOPE_READ_ONLY", pair[0] + " in " + pair[1] + " is refused in parallel: " + JSON.stringify(refused.error));
  });
  var refusedMessage = writes(3, "parent.total=1", "each").error;
  assert(JSON.stringify(refusedMessage).indexOf("reduce") > 0, "The refusal says how to accumulate: " + JSON.stringify(refusedMessage));
  var localWrite = writes(3, "local.a={b:{c:1}}\nlocal.a.b.d=2", "each");
  assert(localWrite.ok && localWrite.result.out === 23, "The local of a parallel chunk stays writable: " + JSON.stringify(localWrite));

  // a composite block keeps its own result and local inside a parallel chunk
  var composite = api("blockCodeSet", {name: "proof.double", code: 'const _meta = {description:"Doubles.", properties:{x:{kind:"expression",type:"number",description:"Value."}}}\n'
    + 'function double({ input, result }) {\n  local.twice = input.x * 2\n  result.value = local.twice\n  return result\n}'});
  assert(composite.ok, "The composite block is saved: " + JSON.stringify(composite));
  var doubled = run(head + 'function Doubled({input,result}){\nlocal.sum=forEachChunk({source:input.items,size:4,parallel:3,$$each:function({chunk}){\n'
    + 'local.d=proof.double({x:chunk.rows.length})\nreturn local.d.value\n},$$reduce:function({acc,value}){\nreturn acc===null?value:acc+value\n}})\nresult.sum=local.sum\n}', {items: items});
  assert(doubled.ok && doubled.result.sum === 46, "A composite block runs in a parallel chunk: " + JSON.stringify(doubled));

  // errors: stop gives the first error in chunk order, continue lists them by chunk
  function failing(onError) {
    return run(head + 'function Failing({input,result}){\nlocal.out=forEachChunk({source:input.items,size:3,parallel:4' + (onError ? ',onError:"' + onError + '"' : '') + ',into:"data",$$each:function({chunk}){\n'
      + 'emit({rows:[{index:chunk.index}]})\n'
      + 'if({condition:chunk.index===5,$$then:function(){throw({code:"BAD_CHUNK_5",message:"bad chunk"})}})\n'
      + 'if({condition:chunk.index===2,$$then:function(){throw({code:"BAD_CHUNK_2",message:"bad chunk"})}})\n'
      + 'return 1\n},$$reduce:function({acc,value}){\nreturn acc===null?value:acc+value\n}})\nresult.out=local.out\n}', {items: items});
  }
  var stopped = failing(), tolerant = failing("continue");
  assert(!stopped.ok && code(stopped.error) === "BAD_CHUNK_2", "The first failed chunk ends the loop: " + JSON.stringify(stopped.error));
  assert(tolerant.ok && tolerant.result.out === 6, "continue reduces the other chunks: " + JSON.stringify(tolerant));
  assert(tolerant.result.data.length === 8 && tolerant.result.data[2].index === 2, "A failed chunk keeps what it emitted before its error, as in sequence: " + JSON.stringify(tolerant.result.data));
  var tolerantSummary = run(head + 'function T({input,result}){\nlocal.s=forEachChunk({source:input.items,size:3,parallel:4,onError:"continue",$$each:function({chunk}){\n'
    + 'if({condition:chunk.index===5 || chunk.index===2,$$then:function(){throw({code:"BAD",message:"bad"})}})\n}})\nresult.s=local.s\n}', {items: items});
  assert(tolerantSummary.ok && JSON.stringify(tolerantSummary.result.s.errors.map(function (e) { return e.index; })) === "[2,5]" && tolerantSummary.result.s.chunks === 8,
    "Errors come in chunk order: " + JSON.stringify(tolerantSummary.result));

  // blocks needing the Convertigo context, and the handles of the caller, are refused in a parallel chunk
  var session = run(head + 'function S({input,result}){\nforEachChunk({source:input.items,size:5,parallel:2,$$each:function({chunk}){\nlocal.v=session.get({key:"k"})\n}})\n}', {items: items});
  assert(!session.ok && code(session.error) === "FOR_EACH_CHUNK_PARALLEL_UNSUPPORTED", "session is refused in a parallel chunk: " + JSON.stringify(session.error));
  // the refusals survive the installation of the cold methods of the run context of a lane
  var cold = api("blockCodeSet", {name: "proof.cold", code: 'const _meta = {runtime:"rhino", description:"Cold.", properties:{}}\n'
    + '(function(){return {run:function(ctx){var learn=ctx.learnOutputSchema;return ctx.runFlowSource("version: 1\\nnodes: []\\n", {}, {});}};}())'});
  assert(cold.ok, "The cold block is saved: " + JSON.stringify(cold));
  var coldRun = run(head + 'function C({input,result}){\nforEachChunk({source:input.items,size:5,parallel:2,$$each:function({chunk}){\nlocal.v=proof.cold({})\n}})\n}', {items: items});
  assert(!coldRun.ok && code(coldRun.error) === "FOR_EACH_CHUNK_PARALLEL_UNSUPPORTED", "A child Flow stays refused after the cold methods: " + JSON.stringify(coldRun.error));
  var opened = api("blockCodeSet", {name: "proof.open", code: 'const _meta = {runtime:"rhino", description:"Opens.", properties:{}}\n'
    + '(function(){return {run:function(ctx){return ctx.createHandle("proof", {n:1}, {label:"proof"});}};}())'});
  var readHandle = api("blockCodeSet", {name: "proof.read", code: 'const _meta = {runtime:"rhino", description:"Reads.", properties:{handle:{kind:"expression",type:"any",description:"Handle."}}}\n'
    + '(function(){return {run:function(ctx,node){return ctx.handleValue(ctx.expr(ctx.props(node).handle), "proof").n;}};}())'});
  assert(opened.ok && readHandle.ok, "The handle blocks are saved: " + JSON.stringify([opened, readHandle]));
  function handles(where, parallel) {
    return run(head + 'function H({input,result}){\nlocal.h=proof.open({})\nlocal.n=forEachChunk({source:input.items,size:5,parallel:' + parallel + ',$$each:function({chunk}){\n'
      + (where === "caller" ? 'local.v=proof.read({handle:parent.h})\nreturn local.v' : 'local.mine=proof.open({})\nlocal.v=proof.read({handle:local.mine})\nreturn local.v')
      + '\n},$$reduce:function({acc,value}){\nreturn acc===null?value:acc+value\n}})\nresult.n=local.n\n}', {items: items});
  }
  assert(handles("caller", 1).ok && handles("caller", 1).result.n === 5, "A sequential chunk reads the handles of the caller");
  var foreign = handles("caller", 3);
  assert(!foreign.ok && code(foreign.error) === "FOR_EACH_CHUNK_PARALLEL_HANDLE", "A parallel chunk cannot read a handle of the caller: " + JSON.stringify(foreign.error));
  var own = handles("own", 3);
  assert(own.ok && own.result.n === 5, "A parallel chunk uses the handles it opens: " + JSON.stringify(own));

  // nesting: a sequential loop inside a parallel chunk writes its own parent, the local of that chunk
  var nested = run(head + 'function N({input,result}){\nlocal.n=forEachChunk({source:input.items,size:6,parallel:3,$$each:function({chunk}){\nlocal.count=0\n'
    + 'forEachChunk({source:chunk.rows,size:2,$$each:function({chunk}){\nparent.count=parent.count+chunk.rows.length\n}})\nreturn local.count\n'
    + '},$$reduce:function({acc,value}){\nreturn acc===null?value:acc+value\n}})\nresult.n=local.n\n}', {items: items});
  assert(nested.ok && nested.result.n === 23, "A loop nested in a parallel chunk writes the local of that chunk: " + JSON.stringify(nested));
  var nestedInto = run(head + 'function NI({input,result}){\nforEachChunk({source:input.items,size:6,parallel:3,$$each:function({chunk}){\n'
    + 'forEachChunk({source:chunk.rows,size:2,into:"inner",$$each:function({chunk}){\nemit({rows:chunk.rows})\n}})\n}})\n}', {items: items});
  assert(!nestedInto.ok && code(nestedInto.error) === "FOR_EACH_CHUNK_PARALLEL_UNSUPPORTED", "A loop with into cannot run in a parallel chunk: " + JSON.stringify(nestedInto.error));

  // analysis: the writes of a parallel slot into parent and result are errors before running; a nested loop writes its parent
  function analysis(parallel) {
    return api("analyze", {flowSource: source(head + 'function A({input,result}){\nlocal.total=0\nforEachChunk({source:input.items,size:3,parallel:' + parallel + ',$$each:function({chunk}){\n'
      + 'parent.total=1\nnumber.add({left:1,right:2,$$out:"result.sum"})\nlocal.n=0\n'
      + 'forEachChunk({source:chunk.rows,size:1,$$each:function({chunk}){\nparent.n=1\n}})\n}})\n}').code});
  }
  var parallelAnalysis = analysis(4), sequentialAnalysis = analysis(1);
  var shared = parallelAnalysis.errors.filter(function (error) { return error.code === "PARALLEL_SCOPE_READ_ONLY"; });
  assert(parallelAnalysis.ok && shared.length === 2 && shared.some(function (e) { return e.message.indexOf("parent.total") === 0; })
    && shared.some(function (e) { return e.message.indexOf("result.sum") === 0 && e.property === "$$out"; }), "Analysis reports the shared writes of a parallel slot: " + JSON.stringify(parallelAnalysis.errors));
  assert(!sequentialAnalysis.errors.some(function (error) { return error.code === "PARALLEL_SCOPE_READ_ONLY"; }), "A sequential slot writes parent and result: " + JSON.stringify(sequentialAnalysis.errors));
  // pickers: no parent nor result destination in a parallel slot; a nested sequential loop offers its parent, not result
  var picked = api("flowSourceValidate", {code: head + 'function P({input,result}){\nlocal.total=0\nforEachChunk({source:input.items,size:3,parallel:4,$$each:function({chunk}){\n'
    + 'number.add({$$id:"inner",left:1,right:2,$$out:"local.sum"})\nforEachChunk({source:chunk.rows,size:1,$$each:function({chunk}){\n'
    + 'number.add({$$id:"deep",left:1,right:2,$$out:"local.x"})\n}})\n}})\n}'});
  assert(picked.ok, "The picker Flow parses: " + JSON.stringify(picked.error));
  var inner = api("context", {flowSource: picked.source, node: "inner", property: "$$out"});
  assert(inner.ok && inner.include.indexOf("local") >= 0 && inner.include.indexOf("parent") < 0 && inner.include.indexOf("result") < 0,
    "A parallel slot offers neither parent nor result as destination: " + JSON.stringify(inner.include));
  var innerRead = api("context", {flowSource: picked.source, node: "inner", property: "left"});
  assert(innerRead.ok && innerRead.scopes.parent && innerRead.scopes.parent.paths.some(function (entry) { return entry.path === "parent.total"; }), "parent stays offered to read: " + JSON.stringify(innerRead.scopes.parent));
  var deep = api("context", {flowSource: picked.source, node: "deep", property: "$$out"});
  assert(deep.ok && deep.include.indexOf("parent") >= 0 && deep.include.indexOf("result") < 0, "A sequential loop in a parallel slot offers its parent, not result: " + JSON.stringify(deep.include));

  // aliases: an object read from the shared scopes stays read-only through local, json.push and json.put included;
  // an object built in local stays writable, and a sequential loop writes them all
  function aliased(parallel, statements) {
    return run(head + 'function Alias({input,result}){\nlocal.o={k:0,deep:{n:0}}\nlocal.list=[1]\nlocal.n=forEachChunk({source:input.items,size:5,parallel:' + parallel + ',$$each:function({chunk}){\n'
      + statements + '\nreturn chunk.rows.length\n},$$reduce:function({acc,value}){\nreturn acc===null?value:acc+value\n}})\nresult.o=local.o\nresult.list=local.list\nresult.items=input.items\nresult.n=local.n\n}', {items: items});
  }
  [["local.alias=parent.o\nlocal.alias.k=chunk.index", "an alias of parent"],
    ["local.alias=parent.o\nlocal.alias.deep.n=chunk.index", "an object below an alias of parent"],
    ["local.d=parent.o.deep\nlocal.d.extra.x=1", "a new key under an alias of parent"],
    ["local.row=chunk.rows[0]\nlocal.row.seen=true", "a row of an array source of the caller input"],
    ["local.l=parent.list\njson.push({path:\"local.l\",value:chunk.index})", "json.push on an alias of parent"],
    ["local.alias=parent.o\njson.put({path:\"local.alias\",key:\"x\",value:1})", "json.put on an alias of parent"]].forEach(function (pair) {
    var refused = aliased(4, pair[0]);
    assert(!refused.ok && code(refused.error) === "PARALLEL_SCOPE_READ_ONLY", pair[1] + " is refused in parallel: " + JSON.stringify(refused.error || refused.result));
    var sequential = aliased(1, pair[0]);
    assert(sequential.ok, pair[1] + " is written in sequence: " + JSON.stringify(sequential.error));
  });
  var untouched = aliased(4, "local.alias=parent.o\nlocal.copy=object.merge({target:local.alias,source:{k:9}})\nlocal.copy.more=1\nlocal.mine={a:{b:1}}\nlocal.mine.a.c=2\n"
    + "local.own=[]\njson.push({path:\"local.own\",value:chunk.index})\njson.put({path:\"local.mine\",key:\"z\",value:3})");
  assert(untouched.ok && untouched.result.o.k === 0 && untouched.result.list.length === 1 && untouched.result.items[0].seen === undefined && untouched.result.n === 23,
    "Objects built in a parallel chunk stay writable and the shared ones unchanged: " + JSON.stringify(untouched.error || untouched.result.o));
  // a parallel loop in a parallel chunk: the objects of the chunk (its parent there) and of the first caller stay read-only
  function nestedAlias(inner) {
    return run(head + 'function NA({input,result}){\nlocal.o={k:0}\nlocal.n=forEachChunk({source:input.items,size:6,parallel:3,$$each:function({chunk}){\n'
      + 'local.mine={k:1}\nlocal.theirs=parent.o\nlocal.inner=forEachChunk({source:chunk.rows,size:2,parallel:2,$$each:function({chunk}){\n' + inner + '\n}})\nreturn 1\n'
      + '},$$reduce:function({acc,value}){\nreturn acc===null?value:acc+value\n}})\nresult.n=local.n\n}', {items: items});
  }
  [["local.b=parent.mine\nlocal.b.k=2", "an object of the enclosing chunk"], ["local.b=parent.theirs\nlocal.b.k=2", "an object of the first caller"],
    ["local.b=input\nlocal.b.k=2", "the input"]].forEach(function (pair) {
    var nested = nestedAlias(pair[0]);
    assert(!nested.ok && code(nested.error) === "PARALLEL_SCOPE_READ_ONLY", "A parallel loop in a parallel chunk keeps " + pair[1] + " read-only: " + JSON.stringify(nested.error || nested.result));
  });
  var nestedOwn = nestedAlias("local.b={k:0}\nlocal.b.k=2");
  assert(nestedOwn.ok && nestedOwn.result.n === 4, "A nested parallel chunk writes what it builds: " + JSON.stringify(nestedOwn.error || nestedOwn.result));

  // the trace and the probes of the chunks come in the trace of the run, in chunk order, as in sequence
  function traced(parallel) {
    return api("run", {flowSource: source(head + 'function Tr({input,result}){\nlocal.n=forEachChunk({source:input.items,size:4,parallel:' + parallel + ',$$each:function({chunk}){\n'
      + 'local.i=chunk.index\ndebug.probe({value:chunk.index,label:"chunk"})\nreturn chunk.rows.length\n},$$reduce:function({acc,value}){\nlocal.s=acc===null?value:acc+value\nreturn local.s\n}})\nresult.n=local.n\n}').code,
      input: {items: items}, includeTrace: true});
  }
  var traceOne = traced(1), traceFour = traced(4);
  function traceShape(response) {
    return JSON.stringify({nodes: (response.trace && response.trace.nodes || []).map(function (node) { return [node.id, node.block, node.result]; }),
      probes: response.trace && response.trace.probes});
  }
  assert(traceOne.ok && traceFour.ok && traceOne.trace.nodes.length > 12, "The traced Flows run: " + JSON.stringify([traceOne.error, traceFour.error]));
  assert(traceShape(traceFour) === traceShape(traceOne), "The trace of a parallel loop is the sequential one: " + traceShape(traceFour) + " / " + traceShape(traceOne));

  // a parallel slot sending requests with an effect, stopped at the first error, gets a warning
  function effects(onError, method) {
    return api("analyze", {flowSource: source(head + 'function E({input,result}){\nforEachChunk({source:input.items,size:3,parallel:4' + (onError ? ',onError:"' + onError + '"' : '') + ',$$each:function({chunk}){\n'
      + 'local.r=' + method + '\n}})\n}').code});
  }
  function effectWarnings(analysis) {
    return analysis.errors.filter(function (error) { return error.code === "FOR_EACH_CHUNK_PARALLEL_EFFECTS"; });
  }
  var posted = effects("", 'http.post({url:"http://example.invalid/rows",body:chunk.rows})');
  assert(posted.ok && effectWarnings(posted).length === 1 && effectWarnings(posted)[0].severity === "warning", "A POST in a parallel chunk that stops gets a warning: " + JSON.stringify(posted.errors));
  assert(effectWarnings(effects("", 'http.request({method:"DELETE",url:"http://example.invalid/rows"})')).length === 1, "A DELETE request too");
  assert(effectWarnings(effects("", 'http.get({url:"http://example.invalid/rows"})')).length === 0, "A GET does not");
  assert(effectWarnings(effects("continue", 'http.post({url:"http://example.invalid/rows",body:chunk.rows})')).length === 0, "Nor a POST with onError continue");

  // bounds
  var tooMany = run(head + 'function L({input,result}){\nforEachChunk({source:input.items,parallel:65,$$each:function({chunk}){\nlocal.x=1\n}})\n}', {items: items});
  assert(!tooMany.ok && code(tooMany.error) === "FOR_EACH_CHUNK_LIMIT_INVALID", "parallel goes up to 64: " + JSON.stringify(tooMany.error));
  var limit = run(head + 'function M({input,result}){\nforEachChunk({source:input.items,size:2,parallel:4,maxChunks:3,$$each:function({chunk}){\nlocal.x=1\n}})\n}', {items: items});
  assert(!limit.ok && code(limit.error) === "FOR_EACH_CHUNK_LIMIT", "maxChunks bounds a parallel loop: " + JSON.stringify(limit.error));
  print("forEachChunk parallel OK (" + checks + " checks)");
} finally { files.deleteDirectory(project); }
