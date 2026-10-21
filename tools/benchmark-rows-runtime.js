// Deterministic Flow runtime fixture, not an implementation of its algorithm.
var File = java.io.File, files = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = String(new File(arguments[0]).getCanonicalPath());
var __flowProjectDir = String(new File(arguments[1]).getCanonicalPath());
var samples = Number(arguments[2] || 20), warmup = Number(arguments[3] || 10);
var shapes = String(arguments[4] || "20x8,100x12").split(",");
// Optional sixth argument is a baseline engine root. Both engines execute in
// the same JVM; alternating order controls JIT/GC/host drift. No fixture work is timed.
function loadEngine(root) {
  var __flowEngineDir = String(new File(root).getCanonicalPath());
  return eval(String(files.readFileToString(new File(__flowEngineDir, "Engine.js"), "UTF-8")));
}
var engines = [{label:"candidate", engine:loadEngine(__flowEngineDir)}];
if (arguments[5]) engines.unshift({label:"baseline",engine:loadEngine(arguments[5])});
// Seventh argument: cells,array by default. Baselines predating rows.* run cells
// only; the same candidate runs both variants with the exact same business output.
var modes = String(arguments[6] || "cells,array").split(",");
var thread = java.lang.management.ManagementFactory.getThreadMXBean();
var threadId = java.lang.Thread.currentThread().getId();
if (!thread.isThreadAllocatedMemorySupported()) throw new Error("Thread allocation counting is unavailable");
if (!thread.isThreadAllocatedMemoryEnabled()) thread.setThreadAllocatedMemoryEnabled(true);
function measure(fn) {
  var allocation = thread.getThreadAllocatedBytes(threadId), cpu = thread.getCurrentThreadCpuTime();
  var started = java.lang.System.nanoTime(), value = fn();
  return { value: value, elapsedMs: Number(java.lang.System.nanoTime() - started) / 1e6,
    threadCpuMs: Number(thread.getCurrentThreadCpuTime() - cpu) / 1e6,
    allocatedBytes: Number(thread.getThreadAllocatedBytes(threadId) - allocation) };
}
function inputFor(n, m) {
  var rows = [], columns = [];
  for (var c = 0; c < m; c++) columns.push({name:"c" + c, kind:["text", "number", "boolean"][c % 3]});
  for (var r = 0; r < n; r++) {
    var row = {id:r + 1, active:r % 5 !== 4};
    for (var c = 0; c < m; c++) row["c" + c] = c % 3 === 0 ? "<Row " + r + " & cell " + c + ">" : c % 3 === 1 ? r * 0.25 + c : r % 2 === 0;
    rows.push(row);
  }
  return {rows:rows, columns:columns};
}
function expected(input) {
  var rows = [];
  input.rows.forEach(function(row) {
    if (!row.active) return;
    var out = {id:row.id};
    input.columns.forEach(function(column) {
      var value = row[column.name], text = value == null ? "" : String(value);
      var numeric = /^-?[0-9]+([.][0-9]+)?$/.test(text);
      if (column.kind === "number" && numeric) text = Number(value).toFixed(2);
      if (column.kind === "boolean") text = value ? "Oui" : "Non";
      out[column.name] = {value:value, text:text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), numeric:numeric};
    });
    rows.push(out);
  });
  return JSON.stringify({rows:rows, count:rows.length});
}
shapes.forEach(function(shape) {
  var counts = shape.split("x"), input = inputFor(Number(counts[0]), Number(counts[1]));
  var reference = expected(input), entries=[];
  engines.forEach(function(entry){modes.forEach(function(mode){
    if(mode!=="cells"&&mode!=="array")throw new Error("Mode takes cells or array");
    if(entry.label==="baseline"&&mode==="array")return;
    var name=mode==="array"?"RowsArray":"RowsCells";
    var request={name:name,flowQName:"qualificationFlowRuntimePerf."+name,
      flowSource:String(files.readFileToString(new File(__flowProjectDir,"_flow/flows/"+name+".flow.js"),"UTF-8")),input:input,includeTrace:false};
    entries.push({label:entry.label,engine:entry.engine,mode:mode,request:request,encoded:JSON.stringify(request)});
  });});
  for (var pass = 0; pass < warmup + samples; pass++) {
    var offset=pass%entries.length,order=entries.slice(offset).concat(entries.slice(0,offset));
    order.forEach(function (entry) {
    var record = measure(function () { return String(entry.engine.run(entry.encoded)); });
    var response = JSON.parse(record.value);
    if (!response.ok || JSON.stringify(response.result) !== reference) throw new Error("Runtime parity failed: " + record.value.slice(0, 1800));
    delete record.value;
    record.kind = "runtime"; record.engine = entry.label; record.mode=entry.mode; record.shape = shape; record.pass = pass + 1; record.warmup = pass < warmup;
    record.resultBytes = new java.lang.String(reference).getBytes("UTF-8").length;
    print("MEASURE " + JSON.stringify(record));
    });
  }
  entries.forEach(function (entry) {
  entry.request.profile=true;
  var profiled = JSON.parse(String(entry.engine.run(JSON.stringify(entry.request))));
  if (!profiled.ok || JSON.stringify(profiled.result) !== reference) throw new Error("Profile parity failed");
  print("PROFILE " + JSON.stringify({engine:entry.label,mode:entry.mode,shape:shape,profile:profiled.profile}));
  });
});
