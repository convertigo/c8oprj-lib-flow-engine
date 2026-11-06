// The input of requestable.call gives the variables of the requestable, never the parameters of the requester: a key
// starting with __ or convertigo. (the requestable, its project, its context, the session, the logs) is refused with
// REQUESTABLE_RESERVED_INPUT (400), apart from the controls __responseExpiryDate, __nocache and __nativeCall, and the
// routing of the definition is set over the input. Checked on the real runtime (a Flow giving its own input, a block
// relaying values with ctx.callBlock, the debug contract of the blocks), with the classes of the Convertigo engine the
// block reads replaced by fixtures in this test only, then on the block alone for the routing. Markers are fixtures.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath()), files = Packages.org.apache.commons.io.FileUtils;
var project = java.nio.file.Files.createTempDirectory("flow-reserved-input-").toFile(), __flowProjectDir = String(project.getAbsolutePath());
// The Convertigo context of the call, as a sequence gives it to its Flow: the requester only reads its HTTP request
var context = { httpServletRequest: { fixture: true } };
var checks = 0, witnesses = [];
function assert(value, message) { checks++; if (!value) throw new Error(message); }
// Each witness is reported, then the program fails if one of them failed
function witness(name, check) {
	try { check(); witnesses.push({ name: name, ok: true }); print("PASS " + name); }
	catch (e) { witnesses.push({ name: name, ok: false }); print("FAIL " + name + ": " + (e && e.message || e)); }
}

// Fixtures: the sequence A of the project Fixture, the transaction C.T of the same project; the requester records the
// request it is given and answers which requestable it would run
var requests = [];
function requestable(className, projectName, name, connector) {
	return {
		getName: function () { return name; },
		getProject: function () { return { getName: function () { return projectName; } }; },
		getConnector: function () { return { getName: function () { return connector; } }; },
		getClass: function () { return { getName: function () { return className; } }; }
	};
}
var requestables = {
	"Fixture.A": requestable("com.twinsoft.convertigo.beans.sequences.GenericSequence", "Fixture", "A"),
	"Fixture.C.T": requestable("com.twinsoft.convertigo.beans.transactions.HtmlTransaction", "Fixture", "T", "C")
};
function Requester(request) { this.request = request; }
Requester.prototype.setRawResult = function () {};
Requester.prototype.processRequestAsObject = function () {
	var seen = {}, keys = this.request.keySet().iterator();
	while (keys.hasNext()) {
		var key = String(keys.next());
		seen[key] = String(this.request.get(key));
	}
	requests.push(seen);
	return { document: { called: seen.__project + "." + (seen.__sequence !== undefined ? seen.__sequence : seen.__connector + "." + seen.__transaction) } };
};
var fixtureClasses = {
	"com.twinsoft.convertigo.engine.Engine": { theApp: { databaseObjectsManager: { getDatabaseObjectByQName: function (qname) { return requestables[String(qname)] || null; } } } },
	"com.twinsoft.convertigo.engine.requesters.NativeJsonRequester": Requester
};
function fixtureClass(name, engineClass) {
	return Object.prototype.hasOwnProperty.call(fixtureClasses, String(name)) ? fixtureClasses[String(name)] : engineClass(name);
}

// Change only the classes given to the scripts the runtime evaluates, in this test, never the product's capabilities
var original = String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var anchor = "scope.flowEngineClass = engineClass;";
assert(original.split(anchor).length === 2, "Engine.js gives the classes of the engine to the scripts it evaluates in one place");
var fixtureSource = original.replace(anchor, "scope.flowEngineClass = function (name) { return fixtureClass(name, engineClass); };");
// The debug contract of the blocks (debug.resolve, then debug.run), with a test-only boundary (debug-native-execution.js)
var debugFrames = [];
function debugBoundary(ctx, node) {
	var frame = { block: String(node.block) };
	debugFrames.push(frame);
	return { before: function (args) { frame.args = args; }, after: function (value) { frame.value = value; }, failed: function (e) { frame.error = e; }, leave: function () {} };
}
try {
	var ordinary = eval(fixtureSource);
	var debugged = eval(fixtureSource.replace(/blockDebugSignal: blockDebugSignal/g, "blockDebugSignal: {active:true}")
		.replace(/beforeDebugBlock: beforeDebugBlock/g, "beforeDebugBlock: debugBoundary"));
	function api(engine, name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	// a block relaying the values it is given to requestable.call, as a library block would
	var relay = api(ordinary, "blockCodeSet", { name: "proof.relayCall", code: 'const _meta = { sourceVersion: 2, runtime: "rhino", ' +
		'properties: { values: { kind: "expression", type: "object" } } };\n(function(){return {run:function(ctx,node){' +
		'return ctx.callBlock("requestable.call",{requestable:"Fixture.A",input:ctx.expr(ctx.props(node).values)},{trace:false});}};}())' });
	assert(relay.ok, "blockCodeSet proof.relayCall: " + JSON.stringify(relay));
	// a public facade written the exposed way: the input of its caller given as the input of the call
	var facade = 'const _flow = { sourceVersion: 2 }\nfunction Facade({ input, config, result }) {\n' +
		'  result.value = requestable.call({ requestable: "Fixture.A", input: input })\n}\n';
	var relayed = 'const _flow = { sourceVersion: 2 }\nfunction Relayed({ input, config, result }) {\n' +
		'  result.value = proof.relayCall({ values: input })\n}\n';
	var modes = [
		{ name: "flow", engine: ordinary, source: facade },
		{ name: "relay", engine: ordinary, source: relayed },
		{ name: "debug flow", engine: debugged, source: facade },
		{ name: "debug relay", engine: debugged, source: relayed }
	];
	function call(mode, input) {
		var before = requests.length, frames = debugFrames.length;
		var out = api(mode.engine, "run", { flowSource: mode.source, input: input, includeTrace: false });
		return { out: out, requests: requests.slice(before), frames: debugFrames.slice(frames) };
	}
	function refused(mode, input) {
		var answer = call(mode, input), error = answer.out.error || {};
		assert(answer.requests.length === 0, mode.name + ": " + JSON.stringify(input) + " reached the requester: " + JSON.stringify(answer.requests));
		assert(!answer.out.ok && error.code === "REQUESTABLE_RESERVED_INPUT" && error.status === 400,
			mode.name + ": " + JSON.stringify(input) + " was not refused: " + JSON.stringify(answer.out));
		Object.keys(input).forEach(function (key) {
			var reserved = /^(__|convertigo\.)/.test(key);
			assert((error.details.keys.indexOf(key) >= 0) === reserved, mode.name + ": the refusal names the keys refused only: " + JSON.stringify(error.details));
		});
		return answer;
	}
	function accepted(mode, input) {
		var answer = call(mode, input);
		assert(answer.out.ok, mode.name + ": " + JSON.stringify(input) + " was refused: " + JSON.stringify(answer.out.error));
		assert(answer.requests.length === 1 && answer.out.result.value.called === "Fixture.A",
			mode.name + ": " + JSON.stringify(input) + " did not call Fixture.A alone: " + JSON.stringify(answer));
		var request = answer.requests[0];
		assert(request.__project === "Fixture" && request.__sequence === "A" && request.__removeContext === "true" &&
			/^flow-/.test(request.__context) && request.__connector === undefined && request.__transaction === undefined,
			mode.name + ": the routing of the definition changed: " + JSON.stringify(request));
		return request;
	}

	modes.forEach(function (mode) {
		witness(mode.name + " - fixed target, input { __sequence: \"B\" } refused", function () {
			var answer = refused(mode, { __sequence: "B" });
			if (mode.engine === debugged) {
				var frame = answer.frames.filter(function (f) { return f.block === "requestable.call"; })[0];
				assert(frame && frame.args && frame.args.input.__sequence === "B" && frame.error && frame.error.code === "REQUESTABLE_RESERVED_INPUT",
					mode.name + ": the refusal did not come from debug.run: " + JSON.stringify(answer.frames));
			}
		});
		witness(mode.name + " - input { __project: \"Other\" } refused", function () { refused(mode, { __project: "Other" }); });
		witness(mode.name + " - input { __nolog: \"true\" } refused", function () { refused(mode, { __nolog: "true" }); });
		witness(mode.name + " - session, context and convertigo.* keys refused", function () {
			[{ __jSessionID: "fixture-session" }, { __context: "fixture" }, { __removeContext: "false" }, { __motherContext: "fixture" },
				{ __removeSession: "true" }, { __connector: "C", __transaction: "T" }, { "convertigo.fixture": "x" }, { name: "x", __async: "true" }]
				.forEach(function (input) { refused(mode, input); });
		});
		witness(mode.name + " - input { __nocache: \"true\" } accepted", function () {
			var request = accepted(mode, { __nocache: "true" });
			assert(request.__nocache === "true", mode.name + ": __nocache was lost: " + JSON.stringify(request));
		});
		witness(mode.name + " - ordinary input unchanged", function () {
			var request = accepted(mode, { name: "x", count: 2, _under: "kept", "a__b": "kept" });
			assert(request.name === "x" && request.count === "2" && request._under === "kept" && request.a__b === "kept" &&
				Object.keys(request).length === 8, mode.name + ": the input variables changed: " + JSON.stringify(request));
		});
	});

	// The block alone: the routing of the definition is set over the input, even when a key passes the list of the
	// controls (a list opened to every routing key, as a later change could do).
	var block = String(files.readFileToString(new java.io.File(engineDir, "blocks/requestable/call.block.js"), "UTF-8"));
	var runtimeSource = block.substring(block.indexOf("\n(function ()"));
	var controls = "var INPUT_CONTROLS = { __responseExpiryDate: true, __nocache: true, __nativeCall: true };";
	function implementation(source) {
		return (function (flowEngineClass) { return eval(source); })(function (name) {
			return fixtureClass(name, function (other) { return Packages[other]; });
		});
	}
	function blockContext() {
		return {
			request: { engineQName: "lib_flow_engine.Engine" },
			props: function (node) { return node.props || {}; },
			template: function (value) { return value; },
			convertigoContext: function () { return context; },
			raise: function (code, message) { var error = new Error(message); error.code = code; throw error; },
			throwFlow: function (options) { var error = new Error(options.message); error.code = options.code; error.status = options.status; throw error; }
		};
	}
	function blockRequest(impl, target, input) {
		var before = requests.length;
		impl.run(blockContext(), { props: { requestable: target, input: input } });
		assert(requests.length === before + 1, "The block did not reach the requester once");
		return requests[before];
	}
	witness("block - the closed list of the controls is the reviewed one", function () {
		assert(runtimeSource.indexOf(controls) >= 0, "INPUT_CONTROLS is not the reviewed closed list");
		var thrown = null;
		try { blockRequest(implementation(runtimeSource), "Fixture.A", { __sequence: "B" }); } catch (e) { thrown = e; }
		assert(thrown && thrown.code === "REQUESTABLE_RESERVED_INPUT" && thrown.status === 400, "The block alone did not refuse __sequence: " + thrown);
	});
	witness("block - the routing of the definition wins over a key that passes the list", function () {
		assert(runtimeSource.indexOf(controls) >= 0, "INPUT_CONTROLS is not the reviewed closed list");
		var opened = implementation(runtimeSource.replace(controls, "var INPUT_CONTROLS = { __responseExpiryDate: true, __nocache: true, " +
			"__nativeCall: true, __project: true, __context: true, __removeContext: true, __sequence: true, __connector: true, __transaction: true };"));
		var sequence = blockRequest(opened, "Fixture.A", { __project: "Other", __sequence: "B", __context: "fixture", __removeContext: "false",
			__connector: "D", __transaction: "U", name: "x" });
		assert(sequence.__project === "Fixture" && sequence.__sequence === "A" && sequence.__removeContext === "true" &&
			/^flow-/.test(sequence.__context) && sequence.__connector === undefined && sequence.__transaction === undefined && sequence.name === "x",
			"A sequence call was routed by its input: " + JSON.stringify(sequence));
		var transaction = blockRequest(opened, "Fixture.C.T", { __project: "Other", __sequence: "B", __connector: "D", __transaction: "U", name: "x" });
		assert(transaction.__project === "Fixture" && transaction.__connector === "C" && transaction.__transaction === "T" &&
			transaction.__sequence === undefined && transaction.name === "x", "A transaction call was routed by its input: " + JSON.stringify(transaction));
	});
} finally {
	files.deleteDirectory(project);
}
var failed = witnesses.filter(function (w) { return !w.ok; });
if (failed.length) throw new Error(failed.length + " of " + witnesses.length + " witnesses failed: " + failed.map(function (w) { return w.name; }).join("; "));
print("requestable-reserved-input OK (" + witnesses.length + " witnesses, " + checks + " checks)");
