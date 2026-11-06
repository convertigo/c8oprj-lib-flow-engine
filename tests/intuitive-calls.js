// An agent writes FlowScript as JavaScript first: Math.pow, Object.assign, JSON.stringify, parseInt, console.log, a
// block name it guesses (smtp.send, crypto.md5, text.trimm) or positional arguments. code-set refused each one with a
// diagnostic and the agent spent turns on flow-block-get and the palette. code-set, code-patch and code-check now answer
// one global patch for the whole source (proposedPatch.edits: [{ oldText, newText, line, confidence, reason, block }],
// ready for explicit code-patch review. autoCorrect is retained as an advisory compatibility flag.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var __flowEngineDir = engineDir;
var project = java.nio.file.Files.createTempDirectory("lib-flow-engine-intuitive-calls").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils, checks = 0;
function assert(condition, message) { checks++; if (!condition) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
	function edit(patch, oldText) { return (patch && patch.edits || []).filter(function (entry) { return entry.oldText.indexOf(oldText) !== -1; })[0]; }

	// A neutral 20-line Flow with eleven intuitive calls
	var intuitive = [
		'function Intuitive({ input, result }) {',
		'  local.largest = Math.max(input.a, input.b)',
		'  local.squared = Math.pow(input.a, 2)',
		'  local.merged = Object.assign({}, input.defaults, input.options)',
		'  local.keys = Object.keys(local.merged)',
		'  local.payload = JSON.stringify(local.merged)',
		'  local.digest = crypto.md5(local.payload)',
		'  local.label = text.trimm(input.label)',
		'  local.sorted = list.sort(input.rows, current.name)',
		'  local.page = parseInt(input.page)',
		'  local.clean = text.replace(local.label, "-", " ")',
		'  console.log(local.label)',
		'  smtp.send({ to: input.email, subject: "Report", body: "Your report is ready." })',
		'  result.largest = local.largest',
		'  result.squared = local.squared',
		'  result.keys = local.keys',
		'  result.digest = local.digest',
		'  result.sorted = local.sorted',
		'  result.page = local.page',
		'  result.clean = local.clean',
		'}'
	].join('\n');

	// 1. Without autoCorrect: refused as before, with the proposed global patch of the working copy
	var proposed = api('flowCodeSet', { name: 'Intuitive', code: intuitive });
	var patch = proposed.proposedPatch;
	assert(proposed.ok === false && patch && patch.revision === proposed.revision && patch.threshold === 0.9,
		'a refused code-set proposes a patch of its working copy: ' + JSON.stringify(proposed).substring(0, 1500));
	// Math.pow and parseInt are expression functions (tests/expression-number-functions.js): no edit for them
	assert(patch.edits.length === 9 && !edit(patch, 'Math.max') && !edit(patch, 'Math.pow') && !edit(patch, 'parseInt'),
		'one edit per intuitive call, none for the Math.max, Math.pow and parseInt expressions: ' + JSON.stringify(patch.edits, null, 1));
	[
		['Object.assign({}, input.defaults, input.options)', 'object.merge({ target: input.defaults, source: input.options })', 0.95, 'object.merge'],
		['Object.keys(local.merged)', 'object.keys({ source: local.merged })', 0.95, 'object.keys'],
		['JSON.stringify(local.merged)', 'json.stringify({ value: local.merged })', 0.95, 'json.stringify'],
		['crypto.md5(local.payload)', 'crypto.hash({ text: local.payload, algorithm: "md5" })', 0.95, 'crypto.hash'],
		['text.trimm(input.label)', 'text.trim({ text: input.label })', 0.95, 'text.trim'],
		['list.sort(input.rows, current.name)', 'list.sort({ items: input.rows, by: current.name })', 0.9, 'list.sort'],
		['text.replace(local.label, "-", " ")', 'text.replace({ text: local.label, search: "-", replacement: " " })', 0.75, 'text.replace'],
		['console.log(local.label)', 'log({ message: local.label })', 0.9, 'log'],
		['smtp.send({ to: input.email, subject: "Report", body: "Your report is ready." })',
			'email.send({ to: input.email, subject: "Report", text: "Your report is ready." })', 0.92, 'email.send']
	].forEach(function (expected) {
		var found = edit(patch, expected[0]);
		if (expected[0].indexOf('Math.max') === 0) return;
		assert(found && found.oldText === expected[0] && found.newText === expected[1] && found.confidence === expected[2] && found.block === expected[3] &&
			typeof found.line === 'number' && typeof found.reason === 'string' && found.reason.length > 10,
			'edit of ' + expected[0] + ': ' + JSON.stringify(found));
	});
	assert(edit(patch, 'text.replace').reason.indexOf('several assignments fit') !== -1, 'an ambiguous positional order is said: ' + edit(patch, 'text.replace').reason);
	assert(edit(patch, 'Object.keys').line === 5 && edit(patch, 'smtp.send').line === 13, 'lines of the source');

	// 2. The patch is ready for code-patch as it is: applied whole, the Flow passes code-check
	var whole = api('flowCodePatch', { name: 'Intuitive', revision: patch.revision, edits: patch.edits });
	assert(whole.ok === true, 'the whole proposal applied by code-patch passes: ' + JSON.stringify(whole).substring(0, 1500));
	assert(api('flowCodeCheck', { name: 'Intuitive' }).ok === true, 'and code-check');
	api('flowCodeDiscard', { name: 'Intuitive' });

	// 3. Compatibility flag is advisory: every guess remains a reviewable proposal.
	var auto = api('flowCodeSet', { name: 'Intuitive', code: intuitive, autoCorrect: true });
	assert(!auto.ok && !auto.autoCorrected && auto.proposedPatch.edits.length === 9,'autoCorrect proposes every edit');
	assert(api('flowCodeGet',{name:'Intuitive'}).code === intuitive,'source is exactly authored');
	var left=auto.proposedPatch;
	var done=api('flowCodePatch',{name:'Intuitive',revision:left.revision,edits:left.edits});
	assert(done.ok,'explicit review applies the complete patch');
	assert(api('flowCodeCheck',{name:'Intuitive'}).ok,'reviewed source checks');

	// 4. Confident corrections do what the JavaScript did: same run as the handwritten Flow (log needs the Convertigo
	// logger, so it is checked above only)
	var confident = [
		'function Equivalent({ input, result }) {',
		'  result.largest = Math.max(input.a, input.b)',
		'  result.squared = Math.pow(input.a, 2)',
		'  local.merged = Object.assign({}, input.defaults, input.options)',
		'  result.keys = Object.keys(local.merged)',
		'  result.payload = JSON.stringify(local.merged)',
		'  result.digest = crypto.md5(result.payload)',
		'  result.label = text.trimm(input.label)',
		'  result.sorted = list.sort(input.rows, current.name)',
		'  result.ordered = list.sort({ items: input.rows, by: current.name, order: "desc" })',
		'}'
	].join('\n');
	var handwritten = [
		'function Handwritten({ input, result }) {',
		'  result.largest = max(input.a, input.b)',
		'  result.squared = input.a * input.a',
		'  local.merged = object.merge({ target: input.defaults, source: input.options })',
		'  result.keys = object.keys({ source: local.merged })',
		'  result.payload = json.stringify({ value: local.merged })',
		'  result.digest = crypto.hash({ text: result.payload, algorithm: "md5" })',
		'  result.label = text.trim({ text: input.label })',
		'  result.sorted = list.sort({ items: input.rows, by: current.name })',
		'  result.ordered = list.sort({ items: input.rows, by: current.name, direction: "desc" })',
		'}'
	].join('\n');
	var input = { a: 3, b: 7, defaults: { size: 10, sort: 'name' }, options: { size: 25 }, label: '  Quarterly report  ',
		rows: [{ name: 'beta' }, { name: 'alpha' }, { name: 'gamma' }] };
	var equivalent = api('flowCodeSet', { name: 'Equivalent', code: confident, autoCorrect: true });
	assert(!equivalent.ok && !equivalent.autoCorrected && equivalent.proposedPatch.edits.length===7,'confident guesses still require review');
	assert(equivalent.proposedPatch.edits.some(function(entry){return entry.oldText.indexOf('order: "desc"')>=0 && entry.newText.indexOf('direction: "desc"')>=0;}),'guessed key is proposed');
	equivalent=api('flowCodePatch',{name:'Equivalent',revision:equivalent.revision,edits:equivalent.proposedPatch.edits});
	assert(equivalent.ok,'reviewed equivalent passes');
	var ran = api('flowCodeRun', { name: 'Equivalent', input: input });
	var expected = api('flowCodeRun', { name: 'Handwritten', code: handwritten, input: input });
	assert(ran.ok && expected.ok && JSON.stringify(ran.result) === JSON.stringify(expected.result), 'same result as the handwritten Flow: ' + JSON.stringify({ ran: ran, expected: expected }).substring(0, 1500));
	assert(ran.result.largest === 7 && ran.result.squared === 9 && ran.result.label === 'Quarterly report' && ran.result.keys.join() === 'size,sort' &&
		ran.result.sorted[0].name === 'alpha' && ran.result.ordered[0].name === 'gamma' && /^[0-9a-f]{32}$/.test(ran.result.digest),
		'and the values JavaScript gives: ' + JSON.stringify(ran.result));

	// 5. Math.max(1, 2) is an expression the run reads: code-set no longer refuses it as an unknown block
	var expression = api('flowCodeSet', { name: 'MaxExpression', code: 'function MaxExpression({ input, result }) {\n  result.value = Math.max(1, 2)\n}' });
	assert(expression.ok === true && !expression.proposedPatch, 'Math.max(1, 2) passes code-set: ' + JSON.stringify(expression).substring(0, 600));

	// 6. Never below the threshold, never an ambiguous choice: a threshold under 0.8 is raised to 0.8
	var low = api('flowCodeSet', { name: 'Intuitive', code: intuitive, autoCorrect: true, autoCorrectThreshold: 0.5 });
	assert(!low.autoCorrected && low.proposedPatch.threshold===0.8 && low.proposedPatch.edits.length===9,'threshold never enables writes');
	assert(api('flowCodeGet',{name:'Intuitive'}).code===intuitive,'low threshold preserves source');
	var otherDomain = api('flowCodeSet', { name: 'OtherDomain', code: 'function OtherDomain({ input, result }) {\n  local.sent = invoice.send({ to: input.email, subject: "Invoice" })\n}', autoCorrect: true });
	var guessed = edit(otherDomain.proposedPatch, 'invoice.send');
	assert(!otherDomain.autoCorrected && guessed && guessed.block === 'email.send' && guessed.confidence <= 0.75 && guessed.reason.indexOf('another namespace') !== -1,
		'a block of another domain is proposed, never applied: ' + JSON.stringify(otherDomain).substring(0, 1200));
	var fetch = api('flowCodeSet', { name: 'Fetch', code: 'function Fetch({ input, result }) {\n  local.page = http.fetch({ url: "https://example.org/a" })\n}', autoCorrect: true });
	var fetched = edit(fetch.proposedPatch, 'http.fetch');
	assert(!fetch.autoCorrected && fetched && fetched.confidence <= 0.75 && fetched.reason.indexOf('about as likely') !== -1,
		'two blocks as likely: proposed with the other one named: ' + JSON.stringify(fetch.proposedPatch));

	var conditional = api('flowCodeSet', { name: 'Conditional', code: 'function Conditional({ input, result }) {\n  result.text = input.ok ? JSON.stringify(input.a) : ""\n}', autoCorrect: true });
	var lazy = edit(conditional.proposedPatch, 'JSON.stringify');
	assert(!conditional.autoCorrected && lazy && lazy.confidence === 1 && lazy.newText.indexOf('input.ok ? json(input.a) : ""') !== -1,
		'the existing pure JSON expression is proposed in place, preserving the condition: ' + JSON.stringify(conditional.proposedPatch));
	var conditionalPatched = api('flowCodePatch', { name: 'Conditional', revision: conditional.revision, edits: conditional.proposedPatch.edits });
	assert(conditionalPatched.ok, 'explicit conditional JSON patch compiles');

	// 7. The same call twice, and a call inside another: each oldText is found once as the edits before it left it
	var twice = api('flowCodeSet', { name: 'Twice', code: [
		'function Twice({ input, result }) {',
		'  result.first = Object.keys(input.a)',
		'  result.second = Object.keys(input.a)',
		'  result.text = JSON.stringify(Object.keys(input.a))',
		'}'].join('\n') });
	var twiceEdits = twice.proposedPatch.edits;
	assert(twiceEdits.length === 3 && twiceEdits[0].oldText === '  result.first = Object.keys(input.a)' &&
		twiceEdits[2].oldText === 'JSON.stringify(Object.keys(input.a))' &&
		twiceEdits[2].newText === 'json.stringify({ value: object.keys({ source: input.a }) })', 'widened to unique lines, nested calls in one edit: ' + JSON.stringify(twiceEdits, null, 1));
	var twicePatched = api('flowCodePatch', { name: 'Twice', revision: twice.revision, edits: twiceEdits });
	assert(!twicePatched.ok && twicePatched.proposedPatch,'nested call lifting is a separate reviewed proposal');
	var lifted=api('flowCodePatch',{name:'Twice',revision:twicePatched.revision,edits:twicePatched.proposedPatch.edits});
	assert(lifted.ok,'explicit lifting preserves evaluation order');

	// 8. code-check of a working copy proposes the same patch, with its revision; no mapping is reported as unresolved
	api('flowCodeSet', { name: 'Checked', code: 'function Checked({ input, result }) {\n  result.keys = Object.keys(input.a)\n  result.root = Math.random()\n}' });
	var check = api('flowCodeCheck', { name: 'Checked' });
	assert(check.ok === false && check.proposedPatch && check.proposedPatch.revision === check.revision && edit(check.proposedPatch, 'Object.keys') &&
		check.proposedPatch.unresolved.length === 1 && check.proposedPatch.unresolved[0].call === 'Math.random()',
		'code-check proposes the patch of the working copy and names what it cannot map: ' + JSON.stringify(check.proposedPatch));

	// 9. code-patch takes autoCorrect too, and a project sets its threshold (authoring.intuitiveCall in _flow/engine.yaml)
	var base = api('flowCodeSet', { name: 'Patched', code: 'function Patched({ input, result }) {\n  result.keys = input.a\n}' });
	var autoPatched = api('flowCodePatch', { name: 'Patched', revision: base.revision, autoCorrect: true,
		edits: [{ oldText: 'result.keys = input.a', newText: 'result.keys = Object.keys(input.a)\n  result.sorted = list.sort(input.rows, current.name)' }] });
	assert(!autoPatched.ok && !autoPatched.autoCorrected && autoPatched.proposedPatch.edits.length===2,'patch flags never apply guesses');
	files.writeStringToFile(new java.io.File(project, '_flow/engine.yaml'), 'version: 1\nauthoring:\n  intuitiveCall:\n    autoCorrectConfidence: 0.95\n', 'UTF-8');
	var strict = api('flowCodeSet', { name: 'Strict', code: 'function Strict({ input, result }) {\n  result.keys = Object.keys(input.a)\n  result.sorted = list.sort(input.rows, current.name)\n}', autoCorrect: true });
	assert(!strict.autoCorrected && strict.proposedPatch.threshold===0.95 && strict.proposedPatch.edits.length===2,'project threshold only annotates proposals');

	print('intuitive-calls OK (' + checks + ' checks)');
} finally {
	files.deleteDirectory(project);
}
