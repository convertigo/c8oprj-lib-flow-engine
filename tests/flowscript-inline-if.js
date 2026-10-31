// An if written with its body on its own line (if (cond) { return }, if (cond) statement, with else on that line) was
// refused as FLOWSCRIPT_UNSUPPORTED_SYNTAX, so an author skipping an item of a forEach with if (...) { return } had
// to nest the rest of the body; and an if (cond) alone on its line, its body on the next line, compiled to an if with
// an empty branch followed by an unconditional statement. The parser now reads the body of an if written on its line
// as the same if written on several lines (a bare return there is the next item in a loop body, as on several lines),
// gives an if (cond) alone on its line the next statement as body, as JavaScript does, and refuses an if without a body.
// } else if (cond) { on several lines, refused as an unbalanced statement (extra }), is read as JavaScript reads it,
// and a refusal in the body of a loop names the line of the file instead of the line counted from that body.
// A block called in a condition is refused with the statement form that works.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-inline-if-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
	function flow(body) {
		return 'const _flow = {\n  sourceVersion: 2,\n  inputs: { stop: { type: "boolean", default: false } }\n}\n\n' +
			'function Orders({ input, config, result }) {\n' + body.join("\n") + '\n}\n';
	}
	function run(source, input) {
		var out = api("run", { flowSource: source, input: input || {}, includeTrace: false });
		assert(out.ok, "The run failed: " + JSON.stringify(out.error) + "\n" + source);
		return out.result;
	}
	function refusal(source) {
		var out = api("run", { flowSource: source, input: {}, includeTrace: false });
		assert(!out.ok && out.error, "The source should be refused:\n" + source);
		return out.error;
	}
	function nodesOf(list, block, found) {
		found = found || [];
		(list || []).forEach(function (node) {
			if (node.block === block) found.push(node);
			Object.keys(node).forEach(function (key) { if (key !== "props" && Array.isArray(node[key])) nodesOf(node[key], block, found); });
		});
		return found;
	}

	// The case seen in an application: the body of forEach stops checking once a failure is known, with if (...) { return }
	// on one line, and records the failure in an if written on several lines.
	var checked = flow([
		'  local.valid = []',
		'  local.failure = null',
		'  forEach({ $$id: "checkOrders", items: [{ id: 1, open: true }, { id: 2, open: false }, { id: 3, open: true }], $$nodes: function () {',
		'    if (local.failure) { return }',
		'    if (current.open !== true) {',
		'      local.failure = { code: "ORDER_CLOSED", id: current.id }',
		'      return',
		'    }',
		'    local.valid = json.push({ $$id: "keep", path: "local.valid", value: current.id })',
		'  } })',
		'  result.valid = local.valid',
		'  result.failure = local.failure'
	]);
	var stopped = run(checked);
	assert(JSON.stringify(stopped) === '{"valid":[1],"failure":{"code":"ORDER_CLOSED","id":2}}',
		"if (...) { return } on one line skips the item and the Flow goes on: " + JSON.stringify(stopped));
	var compiled = api("flowSourceValidate", { name: "Orders", code: checked });
	assert(compiled.ok && nodesOf(compiled.definition.nodes, "next").length === 2 && nodesOf(compiled.definition.nodes, "return").length === 0,
		"Both bare returns of the loop body are the next item: " + JSON.stringify(compiled.definition && compiled.definition.nodes));
	var written = api("flowCodeSet", { name: "Orders", code: checked, draft: false });
	assert(written.ok, "code-set accepts if (...) { return } in a loop body: " + JSON.stringify(written.error || written));

	// A tree edit renders the model again, the if on several lines: same result.
	var rendered = api("flowSourceValidate", { flowSource: compiled.source });
	assert(rendered.ok && JSON.stringify(run(rendered.code)) === JSON.stringify(stopped), "The rendered source behaves the same: " + (rendered.code || JSON.stringify(rendered)));

	// The other ways to write an if on its line.
	function each(body, value) {
		return flow([
			'  local.seen = []',
			'  forEach({ $$id: "eachOrder", items: [1, 2, 3], $$nodes: function () {'
		].concat(body, [
			'    local.seen = json.push({ $$id: "keep", path: "local.seen", value: ' + (value || "current") + ' })',
			'  } })',
			'  result.seen = local.seen'
		]));
	}
	var forms = {
		"no brace": each(['    if (current === 2) return']),
		"semicolon": each(['    if (current === 2) { return; }']),
		"statements": each(['    local.tag = current', '    if (current === 2) { local.tag = 20; return }'], "local.tag"),
		"else": each(['    if (current === 2) { local.tag = "two" } else { local.tag = "other" }'], "local.tag"),
		"else if": each(['    if (current === 1) { local.tag = "one" } else if (current === 2) { return } else { local.tag = "three" }'], "local.tag"),
		"nested": each(['    if (current > 1) { if (current === 2) { return } }']),
		"several lines": each(['    if (current === 2) { local.tag = 2', '      return }']),
		"body on the next line": each(['    if (current === 2)', '      return']),
		"else if on several lines": each(['    if (current === 1) {', '      local.tag = "one"', '    } else if (current === 2) {', '      return',
			'    } else if (current === 3) {', '      local.tag = "three"', '    } else {', '      local.tag = "other"', '    }'], "local.tag")
	};
	var expected = {
		"no brace": "[1,3]", "semicolon": "[1,3]", "statements": "[1,3]", "else": '["other","two","other"]',
		"else if": '["one","three"]', "nested": "[1,3]", "several lines": "[1,3]", "body on the next line": "[1,3]",
		"else if on several lines": '["one","three"]'
	};
	Object.keys(forms).forEach(function (name) {
		var seen = run(forms[name]).seen;
		assert(JSON.stringify(seen) === expected[name], name + ": " + JSON.stringify(seen) + "\n" + forms[name]);
	});
	// Each if of an else if chain on several lines is closed by the } of the last branch, and the Flow goes on after it.
	var chain = flow(['  if (input.stop) {', '    result.branch = "stop"', '  } else if (result.branch) {', '    result.branch = "never"', '  } else {',
		'    result.branch = "go"', '  }', '  result.after = true']);
	assert(JSON.stringify(run(chain, { stop: true })) === '{"branch":"stop","after":true}' && JSON.stringify(run(chain, { stop: false })) === '{"branch":"go","after":true}',
		"An else if chain on several lines runs one branch, then what follows");
	var chainIfs = nodesOf(api("flowSourceValidate", { name: "Orders", code: chain }).definition.nodes, "if");
	assert(chainIfs.length === 2 && chainIfs[0].else && chainIfs[0].else.length === 1 && chainIfs[0].else[0] === chainIfs[1],
		"else if is the if of the else branch: " + JSON.stringify(chainIfs));
	// Two if on one line keep distinct ids.
	var nestedIds = api("flowSourceValidate", { name: "Orders", code: forms.nested });
	var ifIds = nodesOf(nestedIds.definition.nodes, "if").map(function (node) { return node.id; });
	assert(ifIds.length === 2 && ifIds[0] !== ifIds[1], "Two if on one line get distinct ids: " + JSON.stringify(ifIds));

	// Outside a loop, return leaves the Flow; a statement after the closing brace follows the if.
	var leave = flow(['  if (input.stop) { return }', '  result.after = true']);
	assert(JSON.stringify(run(leave, { stop: true })) === "{}" && JSON.stringify(run(leave, { stop: false })) === '{"after":true}',
		"Outside a loop, if (...) { return } leaves the Flow");
	var following = flow(['  if (input.stop) { result.stopped = true } result.after = true']);
	assert(JSON.stringify(run(following, { stop: true })) === '{"stopped":true,"after":true}' && JSON.stringify(run(following, { stop: false })) === '{"after":true}',
		"A statement after the closing brace runs after the if");
	// The if alone on its line no longer runs its next line unconditionally.
	var nextLine = flow(['  result.before = true', '  if (input.stop)', '    return', '  result.after = true']);
	assert(JSON.stringify(run(nextLine, { stop: false })) === '{"before":true,"after":true}', "The next line is the body of the if, run only when it holds");

	// An if without a body is refused, with the form to write.
	var noBody = refusal(flow(['  result.before = true', '  if (input.stop)']));
	assert(noBody.code === "FLOWSCRIPT_UNSUPPORTED_SYNTAX" && noBody.message.indexOf("if without a body at line 8") !== -1 && noBody.hint.indexOf("{ ... }") !== -1,
		"An if at the end of a body has no body: " + JSON.stringify(noBody));
	var emptyBody = refusal(flow(['  if (input.stop);', '  return']));
	assert(emptyBody.code === "FLOWSCRIPT_UNSUPPORTED_SYNTAX" && /if without a body at line 7: if \(input\.stop\);/.test(emptyBody.message),
		"if (...); has an empty body: refused rather than taking the next line: " + JSON.stringify(emptyBody));
	var braceNextLine = refusal(flow(['  if (input.stop)', '  {', '    return', '  }']));
	assert(braceNextLine.code === "FLOWSCRIPT_UNSUPPORTED_SYNTAX" || braceNextLine.code === "FLOWSCRIPT_UNBALANCED_SYNTAX",
		"A brace on the next line is refused, not read as an empty if: " + JSON.stringify(braceNextLine));

	// A refusal in a loop body names the line of the file, not the line counted from the body.
	var inBody = api("flowCodeSet", { name: "Orders", draft: false, code: flow([
		'  forEach({',
		'    $$id: "eachOrder",',
		'    items: [1, 2],',
		'    $$nodes: function () {',
		'      if (current === 2) { local.two = true }',
		'      forEach({ $$id: "eachLine", items: [3], $$nodes: function () {',
		'        do something',
		'      } })',
		'    },',
		'  })'
	]) });
	assert(!inBody.ok && /Unsupported FlowScript syntax at line 13: do something/.test(inBody.error.message),
		"The refused statement of a nested loop body is named at its line of the file: " + JSON.stringify(inBody.error));

	// The canonical block if keeps its call form.
	var canonical = run(each(['    if({ $$id: "skipTwo", condition: current === 2, $$then: function () {', '      return', '    } })']));
	assert(JSON.stringify(canonical.seen) === "[1,3]", "The canonical if is unchanged: " + JSON.stringify(canonical));

	// A block called in the condition of an if is refused with the statement form that works.
	var inCondition = api("flowCodeSet", { name: "Orders", draft: false, code: flow([
		'  if (!date.isValid({ $$id: "validDate", value: "2026-10-31" })) { return }',
		'  result.after = true'
	]) });
	var conditionDiagnostic = inCondition.error && (inCondition.error.details && inCondition.error.details.diagnostics || []).filter(function (d) {
		return d.code === "INVALID_EXPRESSION";
	})[0];
	assert(!inCondition.ok && conditionDiagnostic && /date\.isValid is not an expression function\. A block runs as a statement/.test(conditionDiagnostic.hint) &&
		conditionDiagnostic.hint.indexOf("local.value = date.isValid({ ... }) before the if") !== -1,
		"A block in a condition is refused with the form to write: " + JSON.stringify(inCondition.error));
	var lifted = run(flow([
		'  local.valid = date.isValid({ $$id: "validDate", value: "2026-10-31" })',
		'  if (!local.valid) { return }',
		'  result.after = true'
	]));
	assert(JSON.stringify(lifted) === '{"after":true}', "The block called before the if works: " + JSON.stringify(lifted));

	print("OK flowscript-inline-if (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
