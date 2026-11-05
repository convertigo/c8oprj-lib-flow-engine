// A value relayed from one block to another (ctx.callBlock) is data: runtime text containing ${}, {{ }} or a scope
// path reaches the called block exactly as it was, whatever the kind of the property and the runtime of the block,
// and a block that relays a node of its definition ({ source: true }, list.map projections) evaluates it once, in the
// frame of the definition. The expressions and templates written in a source are still evaluated.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-relayed-values-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function same(actual, expected, message) {
	assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected));
}
var server = null;
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function block(name, code) {
		var set = api("blockCodeSet", { name: name, code: code });
		assert(set.ok, "blockCodeSet " + name + ": " + JSON.stringify(set));
	}
	var properties = '{ text: { kind: "template", type: "string" }, expr: { kind: "expression", type: "string" },' +
		' json: { kind: "expression", type: "unknown" }, obj: { kind: "expression", type: "object" } }';
	// a block written as source, and a Rhino block reading its properties with every evaluator of the context
	block("proof.echoSource", 'const _meta = {\n  "sourceVersion": 2,\n  "properties": ' + properties + ',\n' +
		'  "outputs": { "out": { "type": "object" } }\n}\n\n' +
		'function proof_echoSource({ input, config }) {\n  return { text: input.text, expr: input.expr, json: input.json, obj: input.obj }\n}\n');
	block("proof.echoRhino", 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: ' + properties + ' };\n' +
		'(function(){return {run:function(ctx,node){var p=ctx.props(node);return {text:ctx.template(p.text),expr:ctx.expr(p.expr),' +
		'json:ctx.expr(p.json),obj:ctx.expr(p.obj),render:ctx.render(p.text),input:ctx.input({value:p.text}),compiled:ctx.compileExpr(p.expr)()};}};}())');
	// relays a runtime value to the target block, as a string, as JSON text and inside an object
	block("proof.relay", 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: { target: { kind: "template", type: "string" },' +
		' value: { kind: "expression", type: "unknown" } } };\n' +
		'(function(){return {run:function(ctx,node){var p=ctx.props(node),v=ctx.expr(p.value);' +
		'return ctx.callBlock(String(ctx.template(p.target)),{text:v,expr:v,json:JSON.stringify(v),obj:{nested:[v],deep:{v:v}}},{trace:false});}};}())');
	// relays with the literal notations of the callers: ${JSON} for a template, JSON text for an expression
	block("proof.relayQuoted", 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: { value: { kind: "expression", type: "unknown" } } };\n' +
		'(function(){return {run:function(ctx,node){var v=ctx.expr(ctx.props(node).value),q="${"+JSON.stringify(v)+"}";' +
		'return {rhino:ctx.callBlock("proof.echoRhino",{text:q,expr:JSON.stringify(v)},{trace:false}),source:ctx.callBlock("proof.echoSource",{text:q,expr:JSON.stringify(v)},{trace:false})};}};}())');
	// declared defaults are the source of the block author: a relayed call that leaves them out still gets them evaluated
	block("proof.defaults", 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: {' +
		' greeting: { kind: "template", type: "string", "default": "${config.demo.marker}" }, count: { kind: "expression", type: "integer", "default": 3 } } };\n' +
		'(function(){return {run:function(ctx,node){var p=ctx.props(node);return {greeting:ctx.template(p.greeting),count:ctx.expr(p.count)};}};}())');
	block("proof.relayDefaults", 'const _meta = { sourceVersion: 2, runtime: "rhino", properties: {} };\n' +
		'(function(){return {run:function(ctx,node){return ctx.callBlock("proof.defaults",{},{trace:false});}};}())');

	var marker = "CFG-7731-MARKER";
	function flow(body) {
		return 'const _flow = { sourceVersion: 2, config: { demo: { marker: "' + marker + '" } } }\n' +
			'function Relayed({ input, config, result }) {\n' + body + '\n}\n';
	}
	function run(body, input) {
		var out = api("run", { flowSource: flow(body), includeTrace: false, input: input || {} });
		assert(out.ok, "The run failed: " + JSON.stringify(out.error) + "\n" + body);
		return out.result;
	}
	var texts = [
		"${config.demo.marker}",
		"x ${config.demo.marker} y",
		"${config.demo.marker.substring(0,4)}",
		"${json(config)}",
		"{{ config.demo.marker }}",
		"config.demo.marker",
		"\\${config.demo.marker}",
		"plain text"
	];

	// 1. Relayed to a block written as source and to a Rhino block: every property receives the exact text
	texts.forEach(function (text) {
		var out = run('  result.source = proof.relay({ target: "proof.echoSource", value: input.t })\n' +
			'  result.rhino = proof.relay({ target: "proof.echoRhino", value: input.t })', { t: text });
		same(out.source, { text: text, expr: text, json: text, obj: { nested: [text], deep: { v: text } } }, "Relayed to a source block " + JSON.stringify(text));
		same(out.rhino, { text: text, expr: text, json: text, obj: { nested: [text], deep: { v: text } }, render: text, input: text, compiled: text },
			"Relayed to a Rhino block " + JSON.stringify(text));
		assert(JSON.stringify(out).indexOf(marker) < 0, "Runtime text containing ${} stays literal: " + JSON.stringify(out));
	});
	// a structured value relayed as JSON text or as an object keeps its texts
	var structured = run('  result.out = proof.relay({ target: "proof.echoRhino", value: input.v })', { v: { a: "${config.demo.marker}", list: ["{{ config.demo.marker }}", 2, true, null] } }).out;
	same(structured.json, { a: "${config.demo.marker}", list: ["{{ config.demo.marker }}", 2, true, null] }, "A JSON text relayed to an expression property is its value");
	same(structured.obj.nested[0], structured.json, "A relayed object keeps its texts");
	texts.forEach(function (text) {
		var quoted = run('  result.out = proof.relayQuoted({ value: input.t })', { t: text }).out;
		same([quoted.rhino.text, quoted.rhino.expr, quoted.rhino.render, quoted.source.text, quoted.source.expr], [text, text, text, text, text],
			"The literal notations of a caller give the value " + JSON.stringify(text));
	});
	same(run('  result.out = proof.relayDefaults({})').out, { greeting: marker, count: 3 }, "The declared defaults of a relayed call are evaluated");

	// 2. list.map relays a node of the definition: its properties are evaluated once, in the frame of the projection
	var rows = texts.map(function (text) { return { t: text }; });
	var mapped = run('  local.who = "Ann"\n' +
		'  result.items = list.map({ items: input.rows, select: proof.echoSource({ text: current.t, expr: current.t, obj: { who: local.who, t: current.t } }) })\n' +
		'  result.greet = list.map({ items: input.rows, select: proof.echoSource({ text: `T ${local.who}`, expr: `E ${local.who}`, obj: { n: 1 } }) })',
		{ rows: rows });
	texts.forEach(function (text, i) {
		same([mapped.items[i].text, mapped.items[i].expr, mapped.items[i].obj], [text, text, { who: "Ann", t: text }], "A projection reads the item as data " + JSON.stringify(text));
	});
	same([mapped.greet[0].text, mapped.greet[0].expr, mapped.greet[0].obj], ["T Ann", "E Ann", { n: 1 }], "A projection evaluates its source in the frame of the definition");

	// 3. http.* relays to http.request: the request sent carries the exact text in its query, headers and body
	var received = [];
	server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
	var base = "http://127.0.0.1:" + server.getAddress().getPort();
	server.createContext("/", new com.sun.net.httpserver.HttpHandler({
		handle: function (exchange) {
			var body = String(new java.lang.String(exchange.getRequestBody().readAllBytes(), "UTF-8"));
			received.push({ query: String(exchange.getRequestURI().getRawQuery() || ""), header: String(exchange.getRequestHeaders().getFirst("X-Probe") || ""), body: body });
			var bytes = new java.lang.String("{}").getBytes("UTF-8");
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			exchange.sendResponseHeaders(200, bytes.length);
			exchange.getResponseBody().write(bytes);
			exchange.close();
		}
	}));
	server.start();
	texts.forEach(function (text) {
		received = [];
		run('  result.post = http.post({ url: input.url, query: { q: input.t }, headers: { "X-Probe": input.t }, body: { t: input.t } })\n' +
			'  result.get = http.get({ url: input.url, query: { q: input.t }, headers: { "X-Probe": input.t } })', { url: base + "/probe", t: text });
		assert(received.length === 2, "Two requests: " + JSON.stringify(received));
		received.forEach(function (request) {
			same(String(java.net.URLDecoder.decode(request.query.replace(/^q=/, ""), "UTF-8")), text, "http query " + JSON.stringify(text));
			same(request.header, text, "http header " + JSON.stringify(text));
		});
		same(JSON.parse(received[0].body).t, text, "http body " + JSON.stringify(text));
	});

	// 4. The source keeps its expressions and templates
	var authored = run('  local.who = "Ann"\n' +
		'  result.direct = proof.echoSource({ text: `Hi ${input.name}`, expr: `T ${local.who}`, json: input.n, obj: { a: input.name, b: "lit", c: [local.who] } })\n' +
		'  result.rhino = proof.echoRhino({ text: `M ${config.demo.marker}`, expr: input.name, json: input.n + 1, obj: { a: input.name } })\n' +
		'  result.relayed = proof.relay({ target: "proof.echoSource", value: `R ${local.who}` })', { name: "Bob", n: 41 });
	same(authored.direct, { text: "Hi Bob", expr: "T Ann", json: 41, obj: { a: "Bob", b: "lit", c: ["Ann"] } }, "A source block evaluates its source");
	same([authored.rhino.text, authored.rhino.expr, authored.rhino.json, authored.rhino.obj], ["M " + marker, "Bob", 42, { a: "Bob" }], "A Rhino block evaluates its source");
	same(authored.relayed.text, "R Ann", "The value relayed is the value of the source expression");

	print("relayed-values-literal OK (" + checks + " checks)");
} finally {
	if (server) server.stop(0);
	files.deleteDirectory(project);
}
