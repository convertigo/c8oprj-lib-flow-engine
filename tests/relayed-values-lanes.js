// The lanes a block opens while it runs on values relayed by ctx.callBlock evaluate nothing: the values stay data in
// every lane, and the block keeps them as data after its lanes. Lanes opened by a block on its source keep evaluating
// the source.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-relayed-lanes-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function same(actual, expected, message) {
	assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected));
}
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function rhino(name, properties, body) {
		var set = api("blockCodeSet", { name: name, code: 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: ' + properties + ' };\n' +
			'(function(){return {run:function(ctx,node){var p=ctx.props(node);' + body + '}};}())' });
		assert(set.ok, "blockCodeSet " + name + ": " + JSON.stringify(set));
	}
	rhino("proof.relayTo", '{ target: { kind: "template", type: "string" }, value: { kind: "expression", type: "unknown" } }',
		'return ctx.callBlock(String(ctx.template(p.target)),{value:ctx.expr(p.value)},{trace:false});');
	rhino("proof.lanes", '{ value: { kind: "template", type: "string" } }',
		'var v=p.value,i=0,out=[];' +
		'ctx.runLanes({lanes:2,pull:function(){return i<2?{index:i++,value:v}:null;},' +
		'work:function(lane,task){var expr;try{expr=lane.expr(task.value);}catch(notExpression){expr="not an expression";}' +
		'return {template:lane.template(task.value),expr:expr,input:lane.input({value:task.value}),render:lane.render(task.value),relayed:lane.relayedValues===true};},' +
		'settle:function(done){if(done.failed)throw done.error;out[done.index]=done.value;}});' +
		'return {lanes:out,after:ctx.template(v),relayed:ctx.relayedValues===true};');

	var marker = "CFG-7731-MARKER";
	function run(body, input, source) {
		var out = api("run", { flowSource: 'const _flow = { sourceVersion: 2, config: { demo: { marker: "' + marker + '" } } }\n' +
			'function Lanes({ input, config, result }) {\n' + body + '\n}\n', includeTrace: false, input: input || {} });
		assert(out.ok, "The run failed: " + JSON.stringify(out.error) + "\n" + body);
		assert(source || JSON.stringify(out.result).indexOf(marker) < 0, "Runtime text containing ${} stays literal: " + JSON.stringify(out.result));
		return out.result;
	}

	["x ${config.demo.marker} y", "${config.demo.marker}", "config.demo.marker"].forEach(function (t) {
		var lane = { template: t, expr: t, input: t, render: t, relayed: true };
		same(run('  result.v = proof.relayTo({ target: "proof.lanes", value: input.t })', { t: t }).v, { lanes: [lane, lane], after: t, relayed: true },
			"Lanes of a relayed call keep the data " + JSON.stringify(t));
	});
	// lanes opened by a block on its source still evaluate it
	var source = run('  result.v = proof.lanes({ value: `T ${input.name} ${config.demo.marker}` })', { name: "Bob" }, true).v;
	same([source.lanes[0].template, source.lanes[1].template, source.lanes[0].relayed, source.after, source.relayed],
		["T Bob " + marker, "T Bob " + marker, false, "T Bob " + marker, false], "Lanes of a source call evaluate the source");

	print("relayed-values-lanes OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
