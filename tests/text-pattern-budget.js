// lib/text-pattern.js: JavaScript patterns run by java.util.regex under a budget of reads of the text, with the Java
// helper of libs/src (compiled here as a server compiles it) and with its JavaScript fallback; text.match on Rhino and in
// the browser: its limits, its flags, its codes, a catastrophic pattern stopped within a second and the next call served.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var File = java.io.File, FileUtils = Packages.org.apache.commons.io.FileUtils;
function read(path) {
	return String(FileUtils.readFileToString(new File(engineDir, path), "UTF-8"));
}
function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}
function millis(start) {
	return (java.lang.System.nanoTime() - start) / 1000000;
}
function code(action) {
	try {
		action();
	} catch (e) {
		return e && (e.textPatternCode || e.code) ? { code: e.textPatternCode || e.code, message: String(e.message), status: e.status } : { code: "THROWN " + e };
	}
	return { code: "NONE" };
}

// the Java helper, compiled from libs/src in a class loader of its own, called by reflection
var work = java.nio.file.Files.createTempDirectory("text-pattern-budget").toFile();
var compiler = javax.tools.ToolProvider.getSystemJavaCompiler();
assertTrue(compiler.run(null, null, null, ["--release", "17", "-d", String(work.getPath()),
	String(new File(engineDir, "../libs/src/com/convertigo/libflowengine/TextPatterns.java").getCanonicalPath())]) === 0, "TextPatterns.java compiles");
var loader = new java.net.URLClassLoader([work.toURI().toURL()], java.lang.ClassLoader.getSystemClassLoader());
var helper = loader.loadClass("com.convertigo.libflowengine.TextPatterns");
var Long = java.lang.Long, Integer = java.lang.Integer;
var nativeClass = function () {};
nativeClass.budget = function (steps, timeout) { return helper.getMethod("budget", Long.TYPE, Long.TYPE).invoke(null, [Long.valueOf(steps), Long.valueOf(timeout)]); };
nativeClass.budgeted = function (text, budget) { return helper.getMethod("budgeted", java.lang.String, budget.getClass()).invoke(null, [text, budget]); };
nativeClass.find = function (matcher, from) { return Number(helper.getMethod("find", java.util.regex.Matcher, Integer.TYPE).invoke(null, [matcher, Integer.valueOf(from)])); };

var librarySource = read("lib/text-pattern.js");
function library(withHelper) {
	var flowProjectClass = function (name) { return withHelper && name === "com.convertigo.libflowengine.TextPatterns" ? nativeClass : null; };
	var Packages = { "com.convertigo.libflowengine.TextPatterns": {} };
	Packages["java.util.regex.Pattern"] = java.util.regex.Pattern;
	Packages["java.lang.String"] = java.lang.String;
	Packages["java.lang.System"] = java.lang.System;
	Packages["java.lang.CharSequence"] = java.lang.CharSequence;
	Packages["java.lang.IllegalStateException"] = java.lang.IllegalStateException;
	Packages["java.util.concurrent.ConcurrentHashMap"] = java.util.concurrent.ConcurrentHashMap;
	Packages["java.util.concurrent.FutureTask"] = java.util.concurrent.FutureTask;
	Packages["java.util.concurrent.Callable"] = java.util.concurrent.Callable;
	Packages["java.lang.StackOverflowError"] = java.lang.StackOverflowError;
	return eval(librarySource);
}

// java.util.regex answers the classic exponential cases in a few milliseconds (it remembers the positions a greedy
// repeated group already failed at): within the second, with the answer of JavaScript. Those it cannot shortcut (a lazy
// or back-referenced repetition, a long text, a deep recursion) are stopped by the budget within the second.
var defused = [
	{ name: "(a+)+$ on 30 a and !", pattern: "(a+)+$", text: new Array(31).join("a") + "!" },
	{ name: "(x+x+)+y", pattern: "(x+x+)+y", text: new Array(41).join("x") },
	{ name: "overlapping alternation ^(a|a?)+$", pattern: "^(a|a?)+$", text: new Array(41).join("a") + "b" },
	{ name: "overlapping alternation ^(\\w+\\s?)*$", pattern: "^(\\w+\\s?)*$", text: new Array(21).join("ab ") + "!" }
];
var catastrophic = [
	{ name: "(a+)+$ on 5000 a and !", pattern: "(a+)+$", text: new Array(5001).join("a") + "!" },
	{ name: "(a+?)+?$", pattern: "(a+?)+?$", text: new Array(31).join("a") + "!" },
	{ name: "^(a+)+\\1$", pattern: "^(a+)+\\1$", text: new Array(31).join("a") + "!" },
	{ name: "(a|aa)*c on 50000 a (deep recursion)", pattern: "(a|aa)*c", text: new Array(50001).join("a") }
];
[true, false].forEach(function (withHelper) {
	var label = withHelper ? "Java helper" : "JavaScript fallback";
	var patterns = library(withHelper);

	// the JavaScript meaning, translated
	var m = patterns.match(patterns.compile("^(\\d+)-(?<word>[a-z]+)(x)?$", ""), "12-ab");
	assertTrue(m.matched && JSON.stringify(m.groups) === '["12-ab","12","ab",""]', label + ": groups, an unmatched one empty: " + JSON.stringify(m));
	assertTrue(!patterns.test(patterns.compile("^abc$"), "abc\n"), label + ": $ is the end of the text only, as in JavaScript");
	assertTrue(patterns.test(patterns.compile("^b$", "m"), "a\nb\nc"), label + ": m flag");
	assertTrue(!patterns.test(patterns.compile("a.b"), "a\nb") && patterns.test(patterns.compile("a.b", "s"), "a\nb"), label + ": . and the s flag");
	assertTrue(patterns.test(patterns.compile("^\\s$"), " ") && !patterns.test(patterns.compile("^\\S$"), "　"), label + ": \\s of JavaScript");
	assertTrue(patterns.test(patterns.compile("ABC", "i"), "xabcx"), label + ": i flag");
	assertTrue(JSON.stringify(patterns.match(patterns.compile("\\d+", "g"), "a1b22c333").groups) === '["1","22","333"]', label + ": g gives every match");
	assertTrue(patterns.test(patterns.compile("a{"), "a{") && patterns.test(patterns.compile("[a[&&b]+$"), "x[&&") && patterns.test(patterns.compile("^[^]$"), "\n") &&
		!patterns.test(patterns.compile("[]"), "a"), label + ": literal {, [ and && in a class, [^] and []");
	assertTrue(patterns.replace(patterns.compile("(\\w+) (\\w+)"), "hello world", "$2 $1 $$ $& [$`|$']", true) === "world hello $ hello world [|]", label + ": replacement of JavaScript");
	assertTrue(patterns.replace(patterns.compile("(?<y>\\d{4})-(?<m>\\d{2})"), "2026-11", "$<m>/$<y>", true) === "11/2026", label + ": named replacement");
	assertTrue(patterns.replace(patterns.compile("o"), "foo boo", "0", false) === "f0o boo" && patterns.replace(patterns.compile("o"), "foo boo", "0", true) === "f00 b00", label + ": first or all");
	assertTrue(patterns.replace(patterns.compile("x*"), "abc", "-", true) === "abc".replace(/x*/g, "-"), label + ": empty matches replaced as in JavaScript");
	[["a, b,,c", "\\s*,\\s*"], ["a1b2c3", "(\\d)"], ["abc", ""], ["", "x"], ["", ""], ["a,b,", ","], ["ab", "x*"]].forEach(function (c) {
		var expected = JSON.stringify(c[0].split(new RegExp(c[1]))), actual = JSON.stringify(patterns.split(patterns.compile(c[1]), c[0]));
		assertTrue(actual === expected, label + ": split " + JSON.stringify(c) + " gives " + actual + ", JavaScript " + expected);
	});

	// what Java reads differently is refused, without repeating the pattern
	["\\p{L}", "\\u{41}", "(?>a)", "(?i)a", "a*+", "a++", "(?<my_name>a)", "\\e", "[a", "(", "a**", "*"].forEach(function (pattern) {
		var refused = code(function () { patterns.compile(pattern); });
		assertTrue(refused.code === "TEXT_PATTERN_INVALID" && refused.status === 400 && refused.message.indexOf(pattern) < 0,
			label + ": " + pattern + " refused without being repeated: " + JSON.stringify(refused));
	});
	["y", "u", "gg", "x"].forEach(function (flags) {
		assertTrue(code(function () { patterns.compile("a", flags); }).code === "TEXT_PATTERN_INVALID", label + ": flags " + flags + " refused");
	});

	// the limits
	assertTrue(code(function () { patterns.compile(new Array(502).join("a")); }).code === "TEXT_PATTERN_INVALID", label + ": a pattern of 501 characters");
	assertTrue(code(function () { patterns.compile(new Array(501).join("a")); }).code === "NONE", label + ": a pattern of 500 characters");
	var long = new Array(100002).join("a");
	assertTrue(code(function () { patterns.test(patterns.compile("a"), long); }).code === "TEXT_INPUT_TOO_LONG", label + ": a text of 100001 characters");
	// (the time of a cold matcher on a loaded host is not the subject here)
	assertTrue(patterns.test(patterns.compile("^a+$"), long.substring(1), { timeoutMs: 20000 }), label + ": a text of 100000 characters");

	// a catastrophic pattern stops within a second, inside the matcher, and the next call is served
	defused.forEach(function (c) {
		var started = java.lang.System.nanoTime();
		var answer = patterns.test(patterns.compile(c.pattern), c.text), spent = millis(started);
		assertTrue(answer === false && spent < 1000, label + ": " + c.name + " answered " + answer + " in " + spent + " ms");
		print(label + ": " + c.name + " answered in " + Math.round(spent) + " ms");
	});
	catastrophic.forEach(function (c) {
		var started = java.lang.System.nanoTime();
		var stopped = code(function () { patterns.test(patterns.compile(c.pattern), c.text); });
		var spent = millis(started);
		assertTrue(stopped.code === "TEXT_PATTERN_TIMEOUT" && stopped.status === 422, label + ": " + c.name + " gives TEXT_PATTERN_TIMEOUT: " + JSON.stringify(stopped));
		assertTrue(spent < 1000, label + ": " + c.name + " stopped in " + spent + " ms");
		started = java.lang.System.nanoTime();
		assertTrue(patterns.test(patterns.compile("^a+!$"), new Array(31).join("a") + "!") === true && millis(started) < 200, label + ": the next call after " + c.name);
		print(label + ": " + c.name + " stopped in " + Math.round(spent) + " ms");
	});
});

// the same budget in a run of text.match: the code of the error, the thread free for the next node
var source = read("Engine.js");
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new File(java.lang.System.getProperty("java.io.tmpdir"), "lib-flow-engine-text-pattern-budget").getAbsolutePath());
var engine = eval(source);
function run(nodes, input) {
	return JSON.parse(engine.run(JSON.stringify({ definition: { version: 1, nodes: nodes }, input: input || {}, includeTrace: false })));
}
// a first run loads the catalog, so that the next one measures the node only
assertTrue(run([{ id: "warm", block: "text.match", props: { text: "a", pattern: "a" }, out: "result.m" }]).ok === true, "a first text.match");
var started = java.lang.System.nanoTime();
var redos = run([{ id: "redos", block: "text.match", props: { text: "${input.text}", pattern: "(a+?)+?$" }, out: "result.m" }], { text: new Array(31).join("a") + "!" });
var spent = millis(started);
assertTrue(redos.ok === false && JSON.stringify(redos).indexOf("TEXT_PATTERN_TIMEOUT") >= 0 && spent < 1000,
	"text.match (a+?)+?$ gives TEXT_PATTERN_TIMEOUT in " + spent + " ms: " + JSON.stringify(redos).substring(0, 600));
var after = run([{ id: "flags", block: "text.match", props: { text: "A1 b2", pattern: "[a-z]\\d", flags: "gi" }, out: "result.all" },
	{ id: "caseless", block: "text.match", props: { text: "HTTPS://X", pattern: "^https://", ignoreCase: true }, out: "result.caseless" }]);
assertTrue(after.ok === true && JSON.stringify(after.result.all) === '{"matched":true,"groups":["A1","b2"]}' && after.result.caseless.matched === true,
	"text.match after a timeout, with flags: " + JSON.stringify(after).substring(0, 600));
var invalid = run([{ id: "bad", block: "text.match", props: { text: "secret-input", pattern: "(unclosed-secret" }, out: "result.m" }]);
var invalidText = JSON.stringify(invalid);
assertTrue(invalid.ok === false && invalidText.indexOf("TEXT_PATTERN_INVALID") >= 0 && invalidText.indexOf("unclosed-secret") < 0 && invalidText.indexOf("secret-input") < 0,
	"text.match of an invalid pattern, without the pattern nor the text: " + invalidText.substring(0, 600));
var tooLong = run([{ id: "long", block: "text.match", props: { text: "${input.text}", pattern: "a" }, out: "result.m" }], { text: new Array(100002).join("a") });
assertTrue(tooLong.ok === false && JSON.stringify(tooLong).indexOf("TEXT_INPUT_TOO_LONG") >= 0, "text.match of a text too long: " + JSON.stringify(tooLong).substring(0, 400));

// the browser implementation: the same limits, flags and refusals
var browserMatch = eval("(" + read("blocks/text/match.browser.js") + ")");
assertTrue(JSON.stringify(browserMatch({ text: "A1 b2", pattern: "[a-z]\\d", flags: "gi" })) === '{"matched":true,"groups":["A1","b2"]}', "browser text.match with flags");
[[{ pattern: new Array(502).join("a") }, "TEXT_PATTERN_INVALID"], [{ pattern: "a", flags: "y" }, "TEXT_PATTERN_INVALID"], [{ pattern: "\\p{L}" }, "TEXT_PATTERN_INVALID"],
	[{ pattern: "(?<my_name>a)" }, "TEXT_PATTERN_INVALID"], [{ pattern: "(" }, "TEXT_PATTERN_INVALID"], [{ pattern: "a", text: new Array(100002).join("a") }, "TEXT_INPUT_TOO_LONG"]].forEach(function (c) {
	assertTrue(code(function () { browserMatch(c[0]); }).code === c[1], "browser text.match refuses " + JSON.stringify(c[0]).substring(0, 80) + " with " + c[1]);
});

FileUtils.deleteQuietly(work);
print("text-pattern-budget OK");
