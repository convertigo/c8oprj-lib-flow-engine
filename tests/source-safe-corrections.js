// Authoring corrections must be explicit, executable and conservative. These
// cases cover the run-1 friction examples and the agreed nested-call extension.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-safe-corrections-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils, checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
	function code(name, body, meta) { return (meta ? 'const _flow = ' + JSON.stringify(meta) + '\n' : '') + 'function ' + name + '({ input, result }) {\n' + body + '\n}'; }
	function set(name, body, meta) { return api('flowCodeSet', { name: name, code: code(name, body, meta) }); }
	function hasFix(report, type) { return (report.fixes || []).some(function (fix) { return fix.code === type; }); }
	function same(name, body, manual, input, fixCode) {
		var written = set(name, body);
		assert(written.ok && hasFix(written, fixCode), name + ' correction missing: ' + JSON.stringify(written));
		assert(typeof written.code === 'string' && written.fixes.every(function (fix) { return typeof fix.line === 'number' && typeof fix.before === 'string' && typeof fix.after === 'string'; }), name + ' must expose complete source and structured fixes');
		var run = api('flowCodeRun', { name: name, input: input || {} });
		var expected = api('flowCodeRun', { name: name + 'Manual', code: code(name + 'Manual', manual), input: input || {} });
		assert(run.ok && expected.ok && JSON.stringify(run.result) === JSON.stringify(expected.result), name + ' differs from handwritten source: ' + JSON.stringify({ run: run, expected: expected }));
		var again = api('flowCodeSet', { name: name, code: written.code, revision: written.revision });
		assert(again.ok && !(again.fixes || []).length && again.revision === written.revision, name + ' correction must be idempotent: ' + JSON.stringify(again));
		return written;
	}
	same('Nested', '  result.value = date.diff({ from: date.add({ value: "2025-12-31", months: 2, days: 15 }), to: "2026-03-16" })',
		'  local.due = date.add({ value: "2025-12-31", months: 2, days: 15 })\n  result.value = date.diff({ from: local.due, to: "2026-03-16" })', {}, 'FLOWSCRIPT_BLOCK_CALL_LIFTED');
	same('Arithmetic', '  result.value = date.compare({ left: "2026-03-15", right: "2026-03-16" }) + 1',
		'  local.comparison = date.compare({ left: "2026-03-15", right: "2026-03-16" })\n  result.value = local.comparison + 1', {}, 'FLOWSCRIPT_BLOCK_CALL_LIFTED');
	same('NestedNow', '  result.value = date.now({at:"2026-01-01T00:00:00Z"}) + 1',
		'  local.now = date.now({at:"2026-01-01T00:00:00Z"})\n  result.value = local.now + 1', {}, 'FLOWSCRIPT_BLOCK_CALL_LIFTED');
	same('Positional', '  result.value = text.trim("été")', '  result.value = text.trim({ text: "été" })', {}, 'FLOWSCRIPT_BLOCK_ARGUMENTS_NAMED');
	var commented = same('PositionalComment', '  result.value = text.trim( /* keep argument comment */ " PCA " )', '  result.value = text.trim({ text: " PCA " })', {}, 'FLOWSCRIPT_BLOCK_ARGUMENTS_NAMED');
	assert(commented.code.indexOf('keep argument comment') >= 0, 'Named-argument correction preserves argument comments');
	same('Triple', '  result.value = text.trim({text:text.trim({text:text.trim({text:" three "})})})',
		'  local.a = text.trim({text:" three "})\n  local.b = text.trim({text:local.a})\n  result.value = text.trim({text:local.b})', {}, 'FLOWSCRIPT_BLOCK_CALL_LIFTED');
	same('EmptyCall', '  result.value = list.first()', '  result.value = list.first({})', {}, 'FLOWSCRIPT_BLOCK_ARGUMENTS_NAMED');
	var pair = api('blockCodeSet', { name: 'fixture.pair', code: 'const _meta = { properties: { count: {type:"number",kind:"value"}, label:{type:"string",kind:"value"}}, outputs:{out:{type:"object"}} }\nfunction pair({input}) { return { count: input.count, label: input.label } }' });
	assert(pair.ok && !(pair.fixes || []).length, 'Declared block must not be corrected: ' + JSON.stringify(pair));
	same('TypedPositionals', '  result.value = fixture.pair(3, "PCA")', '  result.value = fixture.pair({count:3,label:"PCA"})', {}, 'FLOWSCRIPT_BLOCK_ARGUMENTS_NAMED');
	same('InputContract', '  result.value = list.first({ items: input.rows })', '  result.value = list.first({ items: input.rows })', { rows: [{ id: 1 }] }, 'FLOWSCRIPT_INPUT_DECLARED');
	var inputSource = api('flowCodeGet', {name:'InputContract'}).code;
	assert(inputSource.indexOf('"array"') !== -1 && inputSource.indexOf('"items"') !== -1, 'Infer array from the block contract, with explicit generic items');
	var untyped = set('Untyped', '  result.value = input.value');
	assert(untyped.ok && untyped.inputDefinitions.value.type === 'any' && untyped.inputDefinitions.value.required === undefined && untyped.inputDefinitions.value['default'] === undefined, 'No guessed coercion, requirement or default: ' + JSON.stringify(untyped));
	var object = set('ObjectInput', '  result.value = input.record.name');
	assert(object.ok && object.inputDefinitions.record.type === 'object', 'Member reads infer an object');
	var metadata = api('flowCodeSet', {name:'Metadata', code:'// keep license\n// keep input comment\nconst _flow = { inputs: { existing: {type:"string"}, }, config: {x:1}, }\nfunction Metadata({input,result}) {\n  result.value = input.extra\n}'});
	assert(metadata.ok && metadata.code.indexOf('keep license') >= 0 && metadata.code.indexOf('keep input comment') >= 0 && metadata.code.indexOf('config: {x:1}') >= 0, 'Additive metadata correction preserves comments and unrelated values: ' + JSON.stringify(metadata));
	var rawText = set('RawText', '  result.value = "date.now() input.ghost ${input.literal}"');
	assert(rawText.ok && !(rawText.fixes || []).length && !rawText.inputDefinitions, 'Strings must not be interpreted as calls or reads: ' + JSON.stringify(rawText));
	var method = set('Slice', '  result.value = input.rows.slice(1, 3)');
	assert(method.ok && !hasFix(method, 'FLOWSCRIPT_BLOCK_ARGUMENTS_NAMED'), 'Run-1 F-02: scope methods are expressions, never positional blocks: ' + JSON.stringify(method));
	[
		'input.q.toLowerCase().indexOf("b")',
		'(input.q + "x").toLowerCase()',
		'String(input.q).toLowerCase()'
	].forEach(function(expression,index){
		same('Run1Methods'+index,'  result.value = '+expression,'  result.value = '+expression,{q:'B'},'FLOWSCRIPT_INPUT_DECLARED');
	});
	same('Run1ObjectArray','  local.rows = list.map({items:[input.row],select:{label:current.label}})\n  result.rows = local.rows',
		'  local.rows = list.map({items:[input.row],select:{label:current.label}})\n  result.rows = local.rows',{row:{label:'PCA'}},'FLOWSCRIPT_INPUT_DECLARED');
	same('Run1DynamicSort','  result.rows = list.sort({items:input.rows,by:current.label,direction:input.sortDir == "desc" ? "desc" : "asc"})',
		'  result.rows = list.sort({items:input.rows,by:current.label,direction:input.sortDir == "desc" ? "desc" : "asc"})',{rows:[{label:'A'},{label:'B'}],sortDir:'desc'},'FLOWSCRIPT_INPUT_DECLARED');
	var projection = set('Projection', '  const rows = list.map({items: input.rows, select: { label: text.trim({text: current.name}) }})\n  result.rows = rows');
	assert(projection.ok && !hasFix(projection,'FLOWSCRIPT_BLOCK_CALL_LIFTED'), 'Existing per-item inline projections must remain per-item: ' + JSON.stringify(projection));
	assert(projection.inputDefinitions.rows.items.type === 'object', 'Per-item member reads infer object items, including HTTP JSON-text elements');
	var projectionRun = api('flowCodeRun',{name:'Projection',input:{rows:[{name:' A '},{name:' B '}]}});
	assert(projectionRun.ok && projectionRun.result.rows[0].label === 'A' && projectionRun.result.rows[1].label === 'B', 'Projection retains its iterator semantics: ' + JSON.stringify(projectionRun));
	same('InsideBranch', '  if ({condition: input.enabled, $$then: function () {\n    result.value = text.trim({ text: text.trim({text:" ok "}) })\n  }, $$else: function () { result.value = "off" }})',
		'  if ({condition: input.enabled, $$then: function () {\n    local.trimmed = text.trim({text:" ok "})\n    result.value = text.trim({text: local.trimmed})\n  }, $$else: function () { result.value = "off" }})', {enabled:true}, 'FLOWSCRIPT_BLOCK_CALL_LIFTED');
	var branchOff = api('flowCodeRun', {name:'InsideBranch',input:{enabled:false}});
	assert(branchOff.ok && branchOff.result.value === 'off', 'The lifted operation stays inside its original branch');
	function refused(name, body, expectedCode) {
		var report = set(name, body);
		assert(!report.ok && JSON.stringify(report.error).indexOf(expectedCode) >= 0, name + ' must be refused: ' + JSON.stringify(report));
		assert(!hasFix(report,'FLOWSCRIPT_BLOCK_CALL_LIFTED'), name + ' must not report an unapplied hoist');
		return report;
	}
	refused('ShortCircuit', '  result.value = input.enabled && text.trim({text:"a"})', 'FLOWSCRIPT_BLOCK_CALL_UNSAFE_CONTEXT');
	refused('Ternary', '  result.value = input.enabled ? text.trim({text:"a"}) : "b"', 'FLOWSCRIPT_BLOCK_CALL_UNSAFE_CONTEXT');
	refused('EarlierRead', '  result.value = input.before + text.trim({text:"a"})', 'FLOWSCRIPT_BLOCK_CALL_UNSAFE_CONTEXT');
	refused('Disabled', '  result.value = text.trim({$$disabled:true,text:text.trim({text:" a "})})', 'FLOWSCRIPT_BLOCK_CALL_UNSAFE_CONTEXT');
	var ambiguous = refused('Ambiguous', '  result.value = list.sort(input.items, "name")', 'FLOWSCRIPT_INVALID_BLOCK_CALL_SIGNATURE');
	assert(!hasFix(ambiguous,'FLOWSCRIPT_BLOCK_ARGUMENTS_NAMED'), 'Do not invent positional property ordering');
	var destination = refused('AmbiguousDestination','  set("local.target")','FLOWSCRIPT_INVALID_BLOCK_CALL_SIGNATURE');
	assert(!hasFix(destination,'FLOWSCRIPT_BLOCK_ARGUMENTS_NAMED'),'A write path is also a possible business argument; never guess value instead');
	refused('RepeatedCalls', '  local.a = http.get({url: "https://example.invalid/a"})\n  local.b = http.get({url: "https://example.invalid/b"})\n  local.c = http.get({url: "https://example.invalid/c"})\n  local.d = http.get({url: "https://example.invalid/d"})', 'FLOWSCRIPT_REPEATED_EXTERNAL_CALLS');
	refused('Unknown', '  result.value = missing.block({value:1})', 'UNKNOWN_BLOCK');
	var localBlock = api('blockCodeSet', {name:'fixture.inferred',code:'const _meta = {properties:{},outputs:{out:{type:"string"}}}\nfunction inferred({input}) { return input.label }'});
	assert(localBlock.ok && hasFix(localBlock, 'FLOW_BLOCK_INPUT_DECLARED') && localBlock.code.indexOf('"label"') >= 0, 'Block properties are added and exposed: ' + JSON.stringify(localBlock));
	var inferredRun = set('CallInferred', '  result.value = fixture.inferred({label:"PCA"})');
	assert(inferredRun.ok && api('flowCodeRun',{name:'CallInferred'}).result.value === 'PCA', 'Corrected block executes normally');
	var blockPatch = api('blockCodePatch',{name:'fixture.inferred',revision:localBlock.revision,code:'const _meta = {properties:{label:{type:"string",kind:"value"}},outputs:{out:{type:"string"}}}\nfunction inferred({input}) { return text.trim(input.label) }'});
	assert(blockPatch.ok && hasFix(blockPatch,'FLOWSCRIPT_BLOCK_ARGUMENTS_NAMED') && hasFix(blockPatch,'FLOWSCRIPT_BLOCK_CALL_LIFTED'),'Block patches use the same explicit correction contract: '+JSON.stringify(blockPatch));
	var outOfBand = api('blockCodeSet',{name:'fixture.externalContract',properties:{existing:{type:'integer',kind:'value',default:7}},code:'function externalContract({input}) { return {existing:input.existing,extra:input.extra} }'});
	assert(outOfBand.ok && hasFix(outOfBand,'FLOW_BLOCK_INPUT_DECLARED') && outOfBand.code.indexOf('"integer"') >= 0 && outOfBand.code.indexOf('"default": 7') >= 0,'An added input must preserve a contract supplied by the caller: '+JSON.stringify(outOfBand));
	var selfOld = api('blockCodeSet',{name:'fixture.self',code:'const _meta = {properties:{first:{type:"string",kind:"value"},second:{type:"number",kind:"value"}},outputs:{out:{type:"any"}}}\nfunction self({input}) { return input.first }'});
	assert(selfOld.ok,'Self-call contract fixture failed');
	var selfNew = api('blockCodeSet',{name:'fixture.self',dry:true,code:'const _meta = {properties:{first:{type:"number",kind:"value"},second:{type:"string",kind:"value"}},outputs:{out:{type:"any"}}}\nfunction self({input}) {\n  local.value = fixture.self(3,"PCA")\n  return local.value\n}'});
	assert(selfNew.ok && selfNew.fixes.some(function(fix){return fix.code==='FLOWSCRIPT_BLOCK_ARGUMENTS_NAMED' && fix.after.indexOf('"first": 3') >= 0 && fix.after.indexOf('"second": "PCA"') >= 0;}),'A self call must use the submitted contract, not the previous cached block: '+JSON.stringify(selfNew));
	var nested = api('flowCodeGet',{name:'Nested'});
	var patch = api('flowCodePatch',{name:'Nested',revision:nested.revision,code:code('Nested','  result.value = text.trim({text:text.trim({text:" patch "})})')});
	assert(patch.ok && hasFix(patch,'FLOWSCRIPT_BLOCK_CALL_LIFTED'), 'code-patch shares the same correction path: ' + JSON.stringify(patch));
	var stale = api('flowCodePatch',{name:'Nested',revision:nested.revision,code:code('Nested','  result.value = "lost"')});
	assert(!stale.ok && stale.error.code === 'FLOW_CODE_REVISION_MISMATCH', 'An explicit stale patch revision stays refused');
	var badPatch = api('flowCodePatch',{name:'Nested',revision:patch.revision,codepatch:'@@ -2,1 +2,1 @@\n- this is not the source\n+  result.value = "lost"\n'});
	assert(!badPatch.ok && api('flowCodeGet',{name:'Nested'}).revision === patch.revision,'Run-1 F-15: mismatched patch context is refused without guessing or changing the working copy');
	var stalePromote = api('flowCodePromote',{name:'Nested',revision:nested.revision});
	assert(!stalePromote.ok && stalePromote.error.code === 'FLOW_CODE_DRAFT_REVISION_MISMATCH', 'An explicit stale promote revision stays refused');
	var promote = api('flowCodePromote',{name:'Nested'});
	assert(promote.ok && promote.promoted && hasFix(promote,'FLOW_CODE_CHECKED_REVISION_SELECTED'), 'The unique current draft is rechecked and selected explicitly: ' + JSON.stringify(promote));
	assert(api('flowCodeRun',{name:'Nested'}).result.value === 'patch', 'Promoted result equals the checked draft');
	var payload = api('flowCodePromote',{name:'Injected',code:code('Injected','  result.value = 1')});
	assert(!payload.ok && payload.error.code === 'FLOW_CODE_REVISION_REQUIRED', 'A supplied payload is not an implicitly checked draft');
	var invalidPromotion = api('flowCodePromote',{name:'ShortCircuit'});
	assert(!invalidPromotion.ok, 'An invalid unique draft is never promoted');
	var readOnlyFile = new java.io.File(project,'_flow/flows/ReadOnly.flow.js');
	var readOnlySource = code('ReadOnly','  result.value = input.undeclared');
	files.writeStringToFile(readOnlyFile,readOnlySource,'UTF-8');
	var passive = api('flowCodeCheck',{name:'ReadOnly'});
	assert(passive.ok && passive.diagnostics.some(function(diagnostic){return diagnostic.code==='FLOWSCRIPT_INPUT_NOT_DECLARED';}), 'Passive checks keep their existing diagnostic');
	assert(String(files.readFileToString(readOnlyFile,'UTF-8')) === readOnlySource, 'Reading/checking must never rewrite a source');
	print('source-safe-corrections OK (' + checks + ' checks)');
} finally { files.deleteDirectory(project); }
