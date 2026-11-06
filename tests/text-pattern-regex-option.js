// text.replace and text.split with regex: true: the pattern of JavaScript ($1, $&, $<name> in the replacement, captured
// groups in the items) under the budget of text.match, on Rhino and in the browser; without regex, the literal text as
// before; the code check refuses a pattern from data in a Flow callable over HTTP.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = engineDir;
var project = java.nio.file.Files.createTempDirectory("text-pattern-regex-option-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}
try {
	var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function run(nodes, input) {
		return JSON.parse(engine.run(JSON.stringify({ definition: { version: 1, nodes: nodes }, input: input || {}, includeTrace: false })));
	}
	var done = run([
		{ id: "swap", block: "text.replace", props: { text: "John Smith, Jane Doe", search: "(\\w+) (\\w+)", replacement: "$2 $1", regex: true }, out: "result.swap" },
		{ id: "first", block: "text.replace", props: { text: "a-b-c", search: "-", replacement: "+", regex: true, all: false }, out: "result.first" },
		{ id: "named", block: "text.replace", props: { text: "2026-11-06", search: "(?<y>\\d+)-(?<m>\\d+)-(?<d>\\d+)", replacement: "$<d>/$<m>/$<y> ($&)", regex: true }, out: "result.named" },
		{ id: "caseless", block: "text.replace", props: { text: "Abc\nabc", search: "^a", replacement: "x", regex: true, flags: "im" }, out: "result.caseless" },
		{ id: "caseSensitive", block: "text.replace", props: { text: "Abc abc", search: "a", replacement: "x", regex: true, caseSensitive: false }, out: "result.caseSensitive" },
		{ id: "literal", block: "text.replace", props: { text: "a.b axb", search: "a.b", replacement: "!" }, out: "result.literal" },
		{ id: "literalDollar", block: "text.replace", props: { text: "price", search: "price", replacement: "$1" }, out: "result.literalDollar" },
		{ id: "split", block: "text.split", props: { text: "a1b22c", separator: "\\d+", regex: true }, out: "result.split" },
		{ id: "splitGroups", block: "text.split", props: { text: "a1b2", separator: "(\\d)", regex: true, trim: false, removeEmpty: false }, out: "result.splitGroups" },
		{ id: "splitSpaces", block: "text.split", props: { text: " a ,b;  c ", separator: "\\s*[,;]\\s*", regex: true, trim: false, removeEmpty: false }, out: "result.splitSpaces" },
		{ id: "splitEmpty", block: "text.split", props: { text: "", separator: "x", regex: true, trim: false, removeEmpty: false }, out: "result.splitEmpty" },
		{ id: "splitLiteral", block: "text.split", props: { text: "a.b", separator: "." }, out: "result.splitLiteral" }
	]);
	assertTrue(done.ok === true, "regex runs: " + JSON.stringify(done).substring(0, 1500));
	var r = done.result;
	var expected = {
		swap: "Smith John, Doe Jane", first: "a+b-c", named: "06/11/2026 (2026-11-06)", caseless: "xbc\nxbc", caseSensitive: "xbc xbc",
		literal: "! axb", literalDollar: "$1", split: ["a", "b", "c"], splitGroups: "a1b2".split(/(\d)/), splitSpaces: " a ,b;  c ".split(/\s*[,;]\s*/),
		splitEmpty: [""], splitLiteral: ["a", "b"]
	};
	Object.keys(expected).forEach(function (key) {
		assertTrue(JSON.stringify(r[key]) === JSON.stringify(expected[key]), key + ": " + JSON.stringify(r[key]) + " instead of " + JSON.stringify(expected[key]));
	});

	// the budget, the limits and the codes
	function failure(nodes, input) {
		var started = java.lang.System.nanoTime(), response = run(nodes, input);
		return { response: JSON.stringify(response), ok: response.ok, ms: (java.lang.System.nanoTime() - started) / 1000000 };
	}
	var evil = new Array(31).join("a") + "!";
	[["text.replace", { text: "${input.text}", search: "(a+?)+?$", replacement: "", regex: true }], ["text.split", { text: "${input.text}", separator: "(a+?)+?$", regex: true }]].forEach(function (c) {
		var stopped = failure([{ id: "evil", block: c[0], props: c[1], out: "result.x" }], { text: evil });
		assertTrue(!stopped.ok && stopped.response.indexOf("TEXT_PATTERN_TIMEOUT") >= 0 && stopped.ms < 1000, c[0] + " stops a catastrophic pattern in " + stopped.ms + " ms: " + stopped.response.substring(0, 400));
		var bad = failure([{ id: "bad", block: c[0], props: Object.assign({}, c[1], c[0] === "text.replace" ? { search: "(secret" } : { separator: "(secret" }), out: "result.x" }], { text: "input-value" });
		assertTrue(!bad.ok && bad.response.indexOf("TEXT_PATTERN_INVALID") >= 0 && bad.response.indexOf("secret") < 0 && bad.response.indexOf("input-value") < 0, c[0] + " invalid pattern: " + bad.response.substring(0, 400));
		var flags = failure([{ id: "flags", block: c[0], props: Object.assign({ flags: "y" }, c[1]), out: "result.x" }], { text: "a" });
		assertTrue(!flags.ok && flags.response.indexOf("TEXT_PATTERN_INVALID") >= 0, c[0] + " flags: " + flags.response.substring(0, 300));
		var long = failure([{ id: "long", block: c[0], props: c[1], out: "result.x" }], { text: new Array(100002).join("a") });
		assertTrue(!long.ok && long.response.indexOf("TEXT_INPUT_TOO_LONG") >= 0, c[0] + " text too long: " + long.response.substring(0, 300));
	});
	assertTrue(run([{ id: "after", block: "text.replace", props: { text: "ab", search: "b", replacement: "c", regex: true }, out: "result.x" }]).result.x === "ac", "the next call is served");

	// the browser implementations
	function browser(file) {
		return eval("(" + String(FileUtils.readFileToString(new java.io.File(engineDir, file), "UTF-8")) + ")");
	}
	var replace = browser("blocks/text/replace.browser.js"), split = browser("blocks/text/split.browser.js");
	assertTrue(replace({ text: "John Smith", search: "(\\w+) (\\w+)", replacement: "$2 $1", regex: true }) === "Smith John", "browser replace with $1");
	assertTrue(replace({ text: "a-b-c", search: "-", replacement: "+", regex: true, all: false }) === "a+b-c" && replace({ text: "Abc", search: "a", replacement: "x", regex: true, flags: "i" }) === "xbc",
		"browser replace: first, flags");
	assertTrue(replace({ text: "a.b axb", search: "a.b", replacement: "!" }) === "! axb", "browser replace stays literal without regex");
	assertTrue(JSON.stringify(split({ text: "a1b22c", separator: "\\d+", regex: true })) === '["a","b","c"]' &&
		JSON.stringify(split({ text: "a1b2", separator: "(\\d)", regex: true, trim: false, removeEmpty: false })) === JSON.stringify("a1b2".split(/(\d)/)), "browser split with regex");
	[function () { replace({ text: "a", search: "\\p{L}", regex: true }); }, function () { split({ text: "a", separator: "a", regex: true, flags: "y" }); }].forEach(function (call, i) {
		var thrown = null;
		try { call(); } catch (e) { thrown = e; }
		assertTrue(thrown && thrown.code === "TEXT_PATTERN_INVALID", "browser refusal " + i + ": " + JSON.stringify(thrown));
	});

	// the code check: a pattern from data, with regex: true, in a Flow callable over HTTP
	function validate(call) {
		var code = "const _flow = { sourceVersion: 2, accessibility: \"public\", inputs: { text: { type: \"string\", default: \"\" }, search: { type: \"string\", default: \"\" } } }\n" +
			"function Check({input, local, result}) {\nlocal.out = " + call + "\nresult.out = local.out\nreturn result\n}";
		var response = JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "Check", code: code })));
		return (response.diagnostics || []).filter(function (d) { return d.code === "TEXT_PATTERN_NOT_LITERAL"; })[0] || null;
	}
	assertTrue(validate("text.replace({ text: input.text, search: input.search, replacement: \"\", regex: true })") !== null, "replace with a pattern from data is refused");
	assertTrue(validate("text.split({ text: input.text, separator: input.search, regex: true })") !== null, "split with a pattern from data is refused");
	assertTrue(validate("text.replace({ text: input.text, search: input.search, replacement: \"\" })") === null, "a literal search from data is not a pattern");
	assertTrue(validate("text.split({ text: input.text, separator: input.search, regex: true, dynamicPattern: true })") === null, "dynamicPattern: true allows it");
	print("text-pattern-regex-option OK");
} finally {
	FileUtils.deleteQuietly(project);
}
