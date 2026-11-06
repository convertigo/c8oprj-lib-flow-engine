// The same contract as relayed-values-lanes.js on real threads: lanes opened on Java threads by a block running on
// values relayed by ctx.callBlock evaluate nothing, and the slots of a forEachChunk with parallel lanes, inside a
// composite block called with values, are still source. In this shared runtime the prepared runner of a stateless block
// (prepareNode) serves the nodes of a definition and never a relayed call. Without a Convertigo server, a minimal shared
// runtime stands in for FlowRuntimeApi: prepare, newCache and compileSymbols, and openLanes running the lanes on Java
// threads.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-relayed-lane-threads-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function same(actual, expected, message) {
	assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected));
}

var laneThreads = new java.util.concurrent.ConcurrentHashMap();
// Lanes on Java threads, run one at a time: the calling thread waits while a lane runs, so that the shared objects of
// this stand-in are never used by two threads at once (the real runtime gives each lane its own Rhino context).
function threadLanes(requested, body) {
	var tasks = new java.util.concurrent.LinkedBlockingQueue(), outcomes = new java.util.concurrent.LinkedBlockingQueue();
	var idle = new java.util.concurrent.Semaphore(0), end = {}, finished = false, threads = [];
	function waitIdle() {
		if (!idle.tryAcquire(30, java.util.concurrent.TimeUnit.SECONDS)) throw new Error("A lane did not come back to its next task");
	}
	var lanes = {
		count: function () { return requested; },
		window: function () { return requested * 2; },
		submit: function (task) { tasks.put(task); waitIdle(); },
		finish: function () {
			if (finished) return;
			finished = true;
			for (var i = 0; i < requested; i++) tasks.put(end);
		},
		poll: function (millis) { return outcomes.poll(Math.max(1, Math.floor(millis)), java.util.concurrent.TimeUnit.MILLISECONDS); },
		stopAfter: function () {},
		cancel: function () { lanes.finish(); },
		startedAfter: function () { return []; },
		cancelled: function () { return ""; },
		next: function () { idle.release(); var task = tasks.take(); return task === end ? null : task; },
		canContinue: function () { return true; },
		complete: function (outcome) { laneThreads.put(String(java.lang.Thread.currentThread().getName()), true); outcomes.put(outcome); },
		close: function () { lanes.finish(); threads.forEach(function (thread) { thread.join(10000); }); }
	};
	for (var i = 0; i < requested; i++) {
		var thread = new java.lang.Thread(new java.lang.Runnable({ run: function () { body(lanes); } }), "relayed-lane-" + i);
		thread.setDaemon(true);
		threads.push(thread);
		thread.start();
		waitIdle();
	}
	return lanes;
}
function newCache(limit) {
	var entries = new java.util.concurrent.ConcurrentHashMap();
	return {
		read: function (key, fingerprint) {
			var entry = entries.get(String(key));
			return entry && (fingerprint === null || fingerprint === undefined || String(fingerprint) === entry.fingerprint) ? entry.value : null;
		},
		write: function (key, fingerprint, value) {
			if (entries.size() >= limit) entries.clear();
			entries.put(String(key), { fingerprint: String(fingerprint), value: value });
			return value;
		},
		clear: function () { entries.clear(); },
		keys: function () { return entries.keySet().toArray(); },
		remove: function (key) { return entries.remove(String(key)) !== null; },
		size: function () { return entries.size(); },
		hits: function () { return 0; },
		misses: function () { return 0; }
	};
}
var preparedValues = {};
var __flowExecutionState = {};
var __flowRuntimeApi = {
	prepare: function (key, factory) {
		if (!Object.prototype.hasOwnProperty.call(preparedValues, key)) preparedValues[key] = factory();
		return preparedValues[key];
	},
	newCache: newCache,
	compileSymbols: function (text) { return text; },
	openLanes: function (count, body) { return threadLanes(count, body); }
};

try {
	// the blocks are on disk before the engine starts: the shared runtime prepares the catalog once
	function block(name, code) {
		files.writeStringToFile(new java.io.File(project, "_flow/blocks/" + name.replace(/\./g, "/") + ".block.js"), code, "UTF-8");
	}
	function rhino(name, properties, body) {
		block(name, 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: ' + properties + ' };\n' +
			'(function(){return {run:function(ctx,node){var p=ctx.props(node);' + body + '}};}())');
	}
	rhino("proof.relayTo", '{ target: { kind: "template", type: "string" }, value: { kind: "expression", type: "unknown" } }',
		'return ctx.callBlock(String(ctx.template(p.target)),{value:ctx.expr(p.value)},{trace:false});');
	rhino("proof.lanes", '{ value: { kind: "template", type: "string" } }',
		'var v=p.value,i=0,out=[];' +
		'ctx.runLanes({lanes:2,pull:function(){return i<4?{index:i++,value:v}:null;},' +
		'work:function(lane,task){return {template:lane.template(task.value),input:lane.input({value:task.value}),relayed:lane.relayedValues===true};},' +
		'settle:function(done){if(done.failed)throw done.error;out[done.index]=done.value;}});' +
		'return {lanes:out,after:ctx.template(v)};');
	rhino("proof.relayChunks", '{ items: { kind: "expression", type: "array" }, label: { kind: "expression", type: "string" } }',
		'return ctx.callBlock("proof.chunks",{items:ctx.expr(p.items),label:ctx.expr(p.label)},{trace:false});');
	block("proof.chunks", 'const _meta = {\n  "sourceVersion": 2,\n' +
		'  "properties": { "items": { "kind": "expression", "type": "array" }, "label": { "kind": "template", "type": "string" } },\n' +
		'  "outputs": { "out": { "type": "string" } }\n}\n\n' +
		'function proof_chunks({ input, config, result }) {\n' +
		'  local.out = forEachChunk({source:input.items,size:1,parallel:2,$$each:function({chunk}){\n' +
		'    local.t = `${chunk.index}:${input.label}`\n    return local.t\n' +
		'  },$$reduce:function({acc,value}){\n    if({condition:acc===null,$$then:function(){return value}})\n' +
		'    local.j = `${acc}|${value}`\n    return local.j\n  }})\n  return local.out\n}\n');

	block("proof.prepared", 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: { value: { kind: "template", type: "string" } } };\n' +
		'(function(){return {stateless:true,' +
		'prepareNode:function(node,helpers){var S=java.lang.System;S.setProperty("flow.test.prepared",String(S.getProperty("flow.test.prepared")||"")+"|"+JSON.stringify(helpers.props));' +
		'var value=helpers.compileValue(helpers.props.value);return function(ctx){return {prepared:true,value:value(ctx)};};},' +
		'run:function(ctx,node){var p=ctx.props(node);return {prepared:false,value:ctx.template(p.value)};}};}())');
	java.lang.System.clearProperty("flow.test.prepared");
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	var marker = "CFG-7731-MARKER";
	function run(body, input) {
		var out = api("run", { flowSource: 'const _flow = { sourceVersion: 2, config: { demo: { marker: "' + marker + '" } } }\n' +
			'function LaneThreads({ input, config, result }) {\n' + body + '\n}\n', includeTrace: false, input: input || {} });
		assert(out.ok, "The run failed: " + JSON.stringify(out.error) + "\n" + body);
		assert(JSON.stringify(out.result).indexOf(marker) < 0, "Runtime text containing ${} stays literal: " + JSON.stringify(out.result));
		return out.result;
	}

	// lanes on threads, opened by a block running on relayed values
	["x ${config.demo.marker} y", "${config.demo.marker}"].forEach(function (t) {
		laneThreads.clear();
		var lane = { template: t, input: t, relayed: true };
		same(run('  result.v = proof.relayTo({ target: "proof.lanes", value: input.t })', { t: t }).v, { lanes: [lane, lane, lane, lane], after: t },
			"Threaded lanes of a relayed call keep the data " + JSON.stringify(t));
		assert(laneThreads.size() >= 1 && String(laneThreads.keySet()).indexOf("relayed-lane-") >= 0, "The lanes ran on threads: " + laneThreads.keySet());
	});

	// the slots of a parallel forEachChunk in a composite block called with values are source, run on the threads
	laneThreads.clear();
	var label = "x ${config.demo.marker} y";
	same(run('  result.v = proof.relayChunks({ items: input.items, label: input.label })', { items: [1, 2], label: label }).v,
		"0:" + label + "|1:" + label, "The slots of a relayed composite block are source");
	assert(laneThreads.size() >= 1, "The chunks ran on threads: " + laneThreads.keySet());

	// the prepared runner serves the definition, a relayed call runs the block itself on its values
	var prepared = run('  result.source = proof.prepared({ value: `S ${input.name}` })\n' +
		'  result.relayed = proof.relayTo({ target: "proof.prepared", value: input.t })', { name: "Bob", t: label });
	same(prepared, { source: { prepared: true, value: "S Bob" }, relayed: { prepared: false, value: label } }, "Prepared runners serve the definition only");
	var seen = String(java.lang.System.getProperty("flow.test.prepared") || "");
	assert(seen.indexOf("S ${input.name}") >= 0 && seen.indexOf("config.demo.marker") < 0, "prepareNode never sees a relayed value: " + seen);

	print("relayed-values-lane-threads OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
