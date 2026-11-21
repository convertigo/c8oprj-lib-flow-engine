// The validation of a Flow Svelte page without the frontbuilder provider (flowSvelteLiteBindingDiagnostics) composes the
// action values the frontbuilder composes (973b12c, 76db082): a source visible here (a snippet parameter, a ForEach item,
// page, layout and route states, a call by its $$id, the event), operators, ?:, templates, arrays, objects of written keys
// and the pure calls. A spread, a computed key, a method, __proto__, any other call or a source not visible stays refused
// with FRONTEND_ACTION_EXPRESSION_NOT_PORTABLE.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var __flowEngineDir = engineDir;
var tree = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "modules/flow-tree-service.js"), "UTF-8")));
var checks = 0;
function check(ok, message) { checks++; if (!ok) throw new Error(message); }
function page(structure) {
	return tree.embeddedFlowSvelteDocument("/lite/+page.flow.svelte", [
		'<script module>export const _flow = { sourceVersion: 2 };</script><FlowComponent $$id="lite" label="Lite">',
		'  <Structure>' + structure + '</Structure>',
		'</FlowComponent>'
	].join("\n"));
}
function variable(value, around) {
	var call = '<CallSequence $$id="save" requestable=".Save"><Variables><Variable $$id="param" name="key" value=' + value + ' /></Variables></CallSequence>';
	return page(around ? around.replace("CALL", call) : call);
}
function refusals(document) { return document.diagnostics.filter(function (d) { return d.code === "FRONTEND_ACTION_EXPRESSION_NOT_PORTABLE"; }); }
[
	["an object of named values", "{{ key: { id: route.params.id }, page: page.offset + 1 }}"],
	["a page state and an operator", "{page.a + 1}"],
	["a comparison, ?: and a template", "{event.value.action === \"edit\" ? `${page.prefix}-${event.value.id}` : null}"],
	["an array and the pure calls", "{[String(page.n), encodeURIComponent(route.params.q), JSON.stringify({ a: 1 })]}"],
	["a ForEach item", "{item.id}", '<ForEach $$id="rows" source="@load.rows" context="item"><Children>CALL</Children></ForEach>'],
	["a snippet parameter", "{row.id}", '<DataTable $$id="table">{#snippet cell(row)}CALL{/snippet}</DataTable>'],
	["a call by its $$id", "{save.result.id}"]
].forEach(function (form) {
	var document = variable(form[1], form[2]);
	check(refusals(document).length === 0, form[0] + " composes: " + JSON.stringify(document.diagnostics));
});
[
	["a spread", "{{ ...event.value }}"],
	["a computed key", "{{ [page.k]: 1 }}"],
	["__proto__", "{{ __proto__: page.a }}"],
	["a method", "{{ run() { return 1 } }}"],
	["another call", "{page.items.map(x => x.id)}"],
	["a source not visible here", "{item.id}"]
].forEach(function (form) {
	var found = refusals(variable(form[1]));
	check(found.length === 1 && found[0].nodeId === "param", form[0] + " stays refused: " + JSON.stringify(found));
});
print("frontend-lite-action-expressions OK (" + checks + " checks)");
