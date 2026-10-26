// Bounded control flow: actual block, source parser, palette, diagnostics and prepared execution.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir);
var project = java.nio.file.Files.createTempDirectory("while-control-").toFile();
var __flowProjectDir = String(project);
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function read(path) { return String(files.readFileToString(new java.io.File(engineDir, path), "UTF-8")); }
function fails(action, code) {
  var error;
  try { action(); } catch (failure) { error = failure; }
  assert(error && error.code === code, "Expected " + code + ", received " + (error && error.code));
}
try {
  var text = read("blocks/while.block.js");
  var block = eval(text.substring(text.indexOf("\n(function")));
  var node = {id: "pages", nodes: [{id: "page"}]};
  function context(props, body, condition) {
    return {count: 0, stopped: false, props: function () { return props; }, template: function (x) { return x; },
      expr: function () { return condition(this); }, canContinue: function () { return true; },
      runNodes: function (nodes) { assert(nodes === node.nodes, "The caller's body is executed"); this.count++; if (body) body(this); },
      throwFlow: function (error, location) { error.location = location.id; throw error; }};
  }
  var zero = context({maxIterations: 3}, null, function () { return false; });
  assert(block.run(zero, node).iterations === 0 && zero.count === 0, "Condition precedes the first iteration");
  var exact = context({maxIterations: 3}, null, function (ctx) { return ctx.count < 3; });
  var value = block.run(exact, node);
  assert(value.completed && value.iterations === 3, "False after exactly the bound completes normally");
  var forever = context({maxIterations: 3}, null, function () { return true; });
  fails(function () { block.run(forever, node); }, "WHILE_ITERATION_LIMIT");
  assert(forever.count === 3, "No extra iteration beyond the bound");
  [null, [], [2], {}, 0, -1, 1.5, "invalid", true, 1000001].forEach(function (limit) {
    fails(function () { block.run(context({maxIterations: limit}, null, function () { return false; }), node); }, "WHILE_LIMIT_INVALID");
  });
  var cancelled = context({maxIterations: 9}, null, function () { return true; });
  cancelled.canContinue = function () { return this.count < 2; };
  fails(function () { block.run(cancelled, node); }, "FLOW_EXECUTION_CANCELLED");
  assert(cancelled.count === 2, "Cancellation is checked even for an empty body");
  var timeout = context({timeoutMs: 1}, function () { java.lang.Thread.sleep(5); }, function () { return true; });
  fails(function () { block.run(timeout, node); }, "WHILE_TIMEOUT");
  var stopped = context({}, function (ctx) { ctx.stopped = true; }, function () { return true; });
  assert(!block.run(stopped, node).completed && stopped.count === 1, "Return/stop leaves the loop");
  fails(function () { block.run(context({}, function () { throw {code: "CHILD_FAILURE"}; }, function () { return true; }), node); }, "CHILD_FAILURE");
  var compilations = 0;
  var prepared = block.prepareNode(node, {props: {condition: "local.count < 3"}, compileExpression: function () {
    compilations++; return function (ctx) { return ctx.count < 3; };
  }});
  for (var i = 0; i < 5; i++) {
    var fresh = context({maxIterations: 3}, null, function () { throw Error("Unprepared expression"); });
    assert(prepared(fresh, node).iterations === 3, "Prepared execution owns its iteration counter");
  }
  assert(compilations === 1 && block.stateless === true, "One expression preparation, immutable shared block");

  var engine = eval(read("Engine.js"));
  function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
  var code = 'const _flow={sourceVersion:2}\nfunction Pages(){\nlocal.page=0\nlocal.loop=while({condition:local.page<3,maxIterations:3,$$nodes:function(){\nlocal.page=local.page+1\n}})\nresult.page=local.page\nresult.completed=local.loop.completed\n}';
  var parsed = api("flowSourceValidate", {code: code});
  assert(parsed.ok, "while parses as a core block: " + JSON.stringify(parsed.error));
  var roundtrip = api("flowSourceValidate", {flowSource: parsed.source});
  assert(roundtrip.ok && roundtrip.code.indexOf("while({") >= 0 && roundtrip.code.indexOf("$$nodes") >= 0, "The writer preserves the control slot");
  var run = api("run", {flowSource: roundtrip.code, includeTrace: false});
  assert(run.ok && run.result.page === 3 && run.result.completed === true, "Real source executes the loop: " + JSON.stringify(run.error));
  var nested = api("run", {flowSource: 'const _flow={sourceVersion:2}\nfunction Nested(){\nlocal.outer=0\nresult.count=0\nwhile({condition:local.outer<2,maxIterations:2,$$nodes:function(){\nlocal.inner=0\nwhile({condition:local.inner<3,maxIterations:3,$$nodes:function(){\nresult.count=result.count+1\nlocal.inner=local.inner+1\n}})\nlocal.outer=local.outer+1\n}})\n}', includeTrace: false});
  assert(nested.ok && nested.result.count === 6, "Nested loops keep independent counters");
  var limitError = api("run", {flowSource: code.replace('condition:local.page<3', 'condition:true'), includeTrace: false});
  assert(!limitError.ok && JSON.stringify(limitError.error).indexOf("WHILE_ITERATION_LIMIT") >= 0, "The iteration error reaches the public boundary");
  var palette = api("blockGet", {name: "while", detail: "full"});
  var descriptor = palette.block || palette.descriptor || palette;
  var props = descriptor.properties || descriptor.props;
  assert(props && props.maxIterations.required && props.maxIterations.default === 1000, "The palette exposes the required default bound");
  assert(descriptor.icon === "mdi:repeat" && descriptor.slots[0].name === "nodes", "Palette icon and child slot are carried");
  print("while block OK (" + checks + " checks)");
} finally { files.deleteDirectory(project); }
