// Shared checks of the FlowScript v3 conformance tests (lib_flow_engine and lib_flow_mcp), loaded with load() in Rhino.
//
// A v3 example is never run by Rhino to validate it. The checks are:
//   1. the text is read by the Rhino 1.9.2 parser of the engine (org.mozilla.javascript.Parser, ES6, no error recovery)
//      after the only preparation of the specification: a same-length rewrite of `const` to `let` in a for...of head;
//   2. it contains none of the constructs the grammar refuses: an AST scan of the syntactic refusals (below), and the
//      reader of the engine (bridge.translate, which lowers the text to blocks and never executes it);
//   3. it has no bare `default(` (a reserved word of JavaScript: the call is flow.default(x, y)).
// An example the reader of the engine refuses only because a rule of the specification is not implemented yet is listed
// in tests/support/flowscript-v3-waiting.json; it still has to be read by Rhino.
function flowscriptV3Conformance(options) {
	var bridge = options.bridge, files = Packages.org.apache.commons.io.FileUtils;
	var ast = Packages.org.mozilla.javascript.ast, Token = Packages.org.mozilla.javascript.Token;
	var api = { incompleteScans: 0 };

	api.read = function (file) { return String(files.readFileToString(file, "UTF-8")); };

	// Fenced blocks of a Markdown text: { lang, attrs, code, line } (line of the opening fence).
	api.fences = function (markdown) {
		var lines = markdown.split("\n"), out = [], open = null;
		for (var i = 0; i < lines.length; i++) {
			var text = lines[i];
			if (!open) {
				var start = /^```(\S*)(.*)$/.exec(text);
				if (start) open = { info: start[1], rest: start[2], line: i + 1, body: [] };
			} else if (/^```\s*$/.test(text)) {
				var attrs = {}, rest = open.rest, found, pattern = /(\w+)=(\S+)/g;
				while ((found = pattern.exec(rest)) !== null) attrs[found[1]] = found[2];
				out.push({ lang: open.info, attrs: attrs, code: open.body.join("\n"), line: open.line });
				open = null;
			} else open.body.push(text);
		}
		return out;
	};
	api.isV3Lang = function (lang) { return lang === "flowscript" || lang === "javascript" || lang === "js"; };

	// A complete program starts with its _flow header or a function; a body is wrapped like a Flow function.
	api.complete = function (snippet, name) {
		var body = String(snippet);
		if (/^\s*(?:const _flow\s*=|function\s)/.test(body)) return body.replace(/\s*$/, "\n");
		return "const _flow = { sourceVersion: 3 }\n\nfunction " + (name || "Example") + "({ input, config, result }) {\n" +
			body.split("\n").map(function (line) { return line ? "  " + line : line; }).join("\n") + "\n}\n";
	};

	// Same-length rewrite of const to let in a for...of head (Rhino 1.9.2 refuses const there).
	api.prepare = function (code) {
		var prepared = code.replace(/(\bfor\s*\(\s*)const(?=\s)/g, function (all, head) { return head + "let  "; });
		if (prepared.length !== code.length) throw new Error("the preparation must keep the length");
		return prepared;
	};

	api.parse = function (code) {
		var env = new Packages.org.mozilla.javascript.CompilerEnvirons();
		env.setLanguageVersion(200); env.setRecoverFromErrors(false);
		try {
			return { ok: true, root: new Packages.org.mozilla.javascript.Parser(env).parse(api.prepare(code), "flowscript-v3", 1) };
		} catch (e) {
			return { ok: false, message: String(e.message || e) };
		}
	};

	// A parse error that is itself a refusal of the grammar.
	api.parseErrorCode = function (message, code) {
		if (/reserved word: import/.test(message)) return "FLOWSCRIPT_V3_IMPORT_SYNTAX";
		if (api.bareDefault(code) && /default namespace|syntax error/.test(message)) return "FLOWSCRIPT_V3_RESERVED_WORD";
		return "";
	};

	// A bare default( call. flow.default( is the accepted spelling.
	api.bareDefault = function (text) { return /(^|[^.\w$])default\s*\(/m.test(text); };
	// In prose, "a default (the" is no call: only default( without a space counts.
	api.bareDefaultInProse = function (line) { return /(^|[^.\w$])default\(/.test(line) && line.indexOf("flow.default(") < 0; };

	function kind(node) { return String(node.getClass().getSimpleName()); }
	function isLoop(node) { var k = kind(node); return k === "ForLoop" || k === "ForInLoop" || k === "WhileLoop" || k === "DoLoop"; }
	var LIST_METHODS = { filter: 1, map: 1, find: 1, some: 1, every: 1, toSorted: 1, sort: 1 };
	function targetName(call) {
		var target = call.getTarget();
		return kind(target) === "PropertyGet" ? String(target.getProperty().getIdentifier()) : "";
	}
	function ancestors(node) { var out = [], at = node.getParent(); while (at) { out.push(at); at = at.getParent(); } return out; }

	// Syntactic refusals of the grammar found in an AST. The scope, chain and typing rules need the reader of the engine.
	api.scan = function (root) {
		var found = {};
		function add(code) { found[code] = true; }
		// Rhino 1.9.2 cannot visit a catch without parameter (NullPointerException): that source is then checked by the
		// reader of the engine only, and counted in incompleteScans.
		try { root.visit(new Packages.org.mozilla.javascript.ast.NodeVisitor({ visit: function (node) {
			var k = kind(node), up;
			if (k === "BreakStatement") {
				if (node.getBreakLabel() !== null) add("FLOWSCRIPT_V3_LOOP_FORM");
				else {
					up = ancestors(node);
					var target = null;
					for (var i = 0; i < up.length && !target; i++) if (isLoop(up[i]) || kind(up[i]) === "SwitchStatement") target = up[i];
					if (!target || kind(target) !== "SwitchStatement") add("FLOWSCRIPT_V3_BREAK");
				}
			} else if (k === "ContinueStatement") {
				if (node.getLabel() !== null) add("FLOWSCRIPT_V3_LOOP_FORM");
			} else if (k === "TryStatement") {
				if (node.getFinallyBlock() !== null) add("FLOWSCRIPT_V3_FINALLY");
			} else if (k === "ReturnStatement") {
				up = ancestors(node);
				for (var j = 0; j < up.length; j++) {
					if (kind(up[j]) === "FunctionNode") break;
					if (isLoop(up[j])) { add("FLOWSCRIPT_V3_RETURN_IN_LOOP"); break; }
				}
			} else if (k === "DoLoop") {
				add("FLOWSCRIPT_V3_LOOP_FORM");
			} else if (k === "ForInLoop") {
				if (!node.isForOf()) add("FLOWSCRIPT_V3_LOOP_FORM");
			} else if (k === "LabeledStatement") {
				var labelled = node.getStatement();
				if (labelled && isLoop(labelled)) add("FLOWSCRIPT_V3_LOOP_FORM");
			} else if (k === "ForLoop") {
				var init = node.getInitializer(), cond = node.getCondition(), step = node.getIncrement();
				var counted = init && kind(init) === "VariableDeclaration" && cond && kind(cond) === "InfixExpression" &&
					(cond.getType() === Token.LT || cond.getType() === Token.LE) && step && (kind(step) === "UpdateExpression" || kind(step) === "UnaryExpression") &&
					step.getType() === Token.INC && step.isPostfix();
				if (!counted) add("FLOWSCRIPT_V3_FOR_FORM");
			} else if (k === "IfStatement" || k === "WhileLoop") {
				var condition = node.getCondition();
				if (condition && kind(condition) === "ObjectLiteral") add("FLOWSCRIPT_V3_OBJECT_CONDITION");
			} else if (k === "ThrowStatement") {
				var thrown = node.getExpression();
				if (kind(thrown) === "NewExpression" && String(thrown.getTarget().toSource()) === "Error") add("FLOWSCRIPT_V3_ERROR_CODE_CHOICE");
			} else if (k === "NewExpression") {
				var name = String(node.getTarget().toSource());
				if (name === "Date") add("FLOWSCRIPT_V3_GLOBAL_CALL");
				else if (name !== "Error") add("FLOWSCRIPT_V3_UNSUPPORTED");
			} else if (k === "KeywordLiteral") {
				if (node.getType() === Token.THIS) add("FLOWSCRIPT_V3_UNSUPPORTED");
			} else if (k === "Yield") {
				add("FLOWSCRIPT_V3_UNSUPPORTED");
			} else if (k === "FunctionNode") {
				if (node.isGenerator && node.isGenerator()) add("FLOWSCRIPT_V3_UNSUPPORTED");
				var parent = node.getParent();
				var topLevel = parent && kind(parent) === "AstRoot";
				var asArrow = false, asSlot = false;
				if (parent && kind(parent) === "FunctionCall" && LIST_METHODS[targetName(parent)]) asArrow = true;
				if (parent && kind(parent) === "ObjectProperty" && /^\$\$/.test(String(parent.getKey().toSource()).replace(/^["']/, ""))) asSlot = true;
				if (!topLevel && !asArrow && !asSlot) add("FLOWSCRIPT_V3_FUNCTION");
			} else if (k === "FunctionCall") {
				var callee = String(node.getTarget().toSource());
				if (callee === "Object.entries" || callee === "Date.now") add("FLOWSCRIPT_V3_GLOBAL_CALL");
			}
			return true;
		} })); } catch (e) { api.incompleteScans++; }
		return Object.keys(found).sort();
	};

	// Diagnostic codes of the reader of the engine (lowering only, nothing is executed).
	api.bridgeCodes = function (code) {
		var result, codes = [];
		try { result = bridge.translate(code); } catch (e) { return ["BRIDGE_EXCEPTION: " + String(e.message || e).substring(0, 120)]; }
		for (var i = 0; i < result.diagnostics.length; i++) if (codes.indexOf(result.diagnostics[i].code) < 0) codes.push(result.diagnostics[i].code);
		return codes;
	};

	// An accepted example: read by Rhino, no refused construct.
	api.checkAccepted = function (code) {
		var parsed = api.parse(code);
		if (!parsed.ok) return { parse: false, problems: ["Rhino 1.9.2 does not read it: " + parsed.message] };
		var problems = [];
		if (api.bareDefault(code)) problems.push("bare default( call (write flow.default( or ??)");
		api.scan(parsed.root).forEach(function (c) { problems.push("uses a refused construct (" + c + ")"); });
		api.bridgeCodes(code).forEach(function (c) { if (problems.join().indexOf(c) < 0) problems.push("the reader refuses it (" + c + ")"); });
		return { parse: true, problems: problems };
	};

	// A refused example: read by Rhino (unless the refusal is a parse error) and refused with exactly its code.
	api.checkRefused = function (code, expected, parseError) {
		var parsed = api.parse(code);
		if (parseError) {
			var found = parsed.ok ? "" : api.parseErrorCode(parsed.message, code);
			return { parse: !parsed.ok && found === expected, problems: found === expected ? [] : ["expected a parse error meaning " + expected + ", got " + (parsed.ok ? "none" : parsed.message)] };
		}
		if (!parsed.ok) return { parse: false, problems: ["Rhino 1.9.2 does not read it: " + parsed.message] };
		var codes = api.bridgeCodes(code).concat(api.scan(parsed.root));
		return { parse: true, problems: codes.indexOf(expected) >= 0 && api.bridgeCodes(code)[0] === expected ? [] : ["expected " + expected + ", the reader says " + JSON.stringify(api.bridgeCodes(code))] };
	};

	// The guides and skills that teach FlowScript v3 (lib_flow_mcp/_flow/resources).
	api.guidePaths = [
		"guide/authoring.md", "guide/authoring-collections.md", "guide/authoring-data.md",
		"guide/authoring-source.md", "guide/authoring-blocks.md", "guide/authoring/dialect.md",
		"guide/authoring/expressions.md", "guide/authoring/forms.md", "guide/start.md", "guide/start/syntax.md",
		"skills/convertigo-flow-backend/SKILL.md", "skills/convertigo-flow-mcp/SKILL.md"
	];
	// Examples of those guides: { id, path, code (a complete program), refused }, and the prose problems found (bare default( ).
	api.guideExamples = function (resources) {
		var examples = [], problems = [];
		api.guidePaths.forEach(function (path) {
			var file = new java.io.File(resources, path);
			if (!file.isFile()) { problems.push("missing guide: " + path); return; }
			var text = api.read(file), index = 0;
			text.split("\n").forEach(function (line, n) {
				if (api.bareDefaultInProse(line)) problems.push(path + ":" + (n + 1) + ": bare default( in a v3 guide");
			});
			api.fences(text).forEach(function (fence) {
				if (!api.isV3Lang(fence.lang)) return;
				// Guides: every JavaScript fence; skills: the fences that declare sourceVersion 3 (as flowscript-v3-guide-examples.js).
				if (!/^guide\//.test(path) && !/sourceVersion\s*:\s*3/.test(fence.code)) return;
				index++;
				examples.push({ id: "guide:" + path + "#" + index, path: path, code: api.complete(fence.code, "GuideExample" + index), refused: fence.attrs.refused || "" });
			});
		});
		return { examples: examples, problems: problems };
	};

	// The waiting list: ids of examples that Rhino reads but the reader of the engine does not accept yet.
	api.waiting = JSON.parse(api.read(options.waitingFile));
	return api;
}
