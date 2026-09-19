// The dialect belongs to each source, including reusable block implementations.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "libs/flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-block-dialect-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	var code = [
		'const _meta = { sourceVersion: 2, runtime: "flow", properties: { id: {kind:"value",type:"number"}, disabled: {kind:"value",type:"boolean"} }, outputs: {out:{type:"object",properties:{id:{type:"number"},disabled:{type:"boolean"}}}} }',
		'function Modern({input, result}) {',
		'  set({ $$id: "save", path: "result.id", value: input.id })',
		'  set({ $$id: "flag", path: "result.disabled", value: input.disabled })',
		'}'
	].join("\n");
	var saved = api("blockCodeSet", { name: "proof.modern", code: code });
	assert(saved.ok, "Block version 2 rejected: " + JSON.stringify(saved));
	var read = api("blockCodeGet", { name: "proof.modern" });
	assert(read.ok && read.code.indexOf('"sourceVersion": 2') !== -1, "Block writer lost source version: " + JSON.stringify(read));
	function call(version, props) {
		return api("run", { flowSource: (version === 2 ? 'const _flow = {sourceVersion:2}\n' : '') +
			'function Proof() {\nproof.modern({' + props + '})\n}', includeTrace: false });
	}
	var modern = call(2, '$$id:"call", $$out:"result.row", id:5, disabled:true');
	assert(modern.ok && modern.result.row.id === 5 && modern.result.row.disabled === true, "Modern caller result: " + JSON.stringify(modern));
	var legacy = call(1, 'id:"call", out:"result.row", props:{id:7, disabled:false}');
	assert(legacy.ok && legacy.result.row.id === 7 && legacy.result.row.disabled === false, "Legacy caller result: " + JSON.stringify(legacy));
	var invalid = api("blockCodeSet", { name: "proof.invalid", code: code.replace('sourceVersion: 2', 'sourceVersion: 999') });
	assert(!invalid.ok && JSON.stringify(invalid).indexOf("FLOW_SOURCE_VERSION_UNSUPPORTED") !== -1, "Unknown block dialect did not fail explicitly");
	var descriptor = api("blockGet", { name: "proof.modern", detail: "full" });
	assert(descriptor.descriptor.sourceVersion === 2, "Public block descriptor lost dialect");
	var duplicate = api("blockDuplicate", { fromName: "proof.modern", toName: "proof.copied" });
	assert(duplicate.blockId === "proof.copied", "Duplicate failed: " + JSON.stringify(duplicate));
	var copied = api("blockCodeGet", { name: "proof.copied" });
	assert(copied.ok && copied.code.indexOf('"sourceVersion": 2') !== -1 && copied.code.indexOf('$$id:') !== -1, "Duplicate lost source dialect");
	var editedDescriptor = descriptor.descriptor;
	editedDescriptor.description = "Changed through the descriptor editor";
	var edited = api("blockEdit", { name: "proof.modern", descriptor: editedDescriptor });
	assert(edited.blockId === "proof.modern", "Descriptor editing lost source dialect: " + JSON.stringify(edited));
	assert(call(2, '$$out:"result.row", id:9, disabled:false').result.row.id === 9, "Runtime changed after descriptor editing");
	var badDescriptor = JSON.parse(JSON.stringify(editedDescriptor));
	badDescriptor.sourceVersion = 1;
	var conflict = api("blockEdit", { name: "proof.modern", descriptor: badDescriptor });
	assert(!conflict.ok && conflict.error.code === "FLOW_SOURCE_VERSION_CONFLICT", "Descriptor silently changed the implementation dialect");
	var unchanged = api("blockCodeGet", { name: "proof.modern" });
	assert(unchanged.ok && unchanged.code.indexOf('"sourceVersion": 2') !== -1, "Rejected edit changed stored code");
	var slotCode = 'const _meta = {runtime:"rhino", properties:{then:{kind:"value",type:"array"}}, slots:{then:{},otherwise:{}}}\n' +
		'(function(){return {run:function(ctx,node){ctx.write("result.keys",Object.keys(ctx.props(node)));ctx.write("result.business",ctx.props(node).then);ctx.runNodes(node.then);ctx.runNodes(node.otherwise);}};}())';
	var holder = api("blockCodeSet", { name: "proof.holder", code: slotCode });
	assert(holder.ok, "Slot fixture failed: " + JSON.stringify(holder));
	var slots = 'const _flow = {sourceVersion:2}\nfunction Slots() {\nproof.holder({$$id:"holder", then:[{id:5}], $$then:function(){set({path:"result.a",value:1})}, $$otherwise:function(){set({path:"result.b",value:2})}})\n}';
	var checked = api("flowSourceValidate", { code: slots });
	assert(checked.ok, "Namespaced slots rejected: " + JSON.stringify(checked));
	var roundTrip = api("flowSourceValidate", { flowSource: checked.source });
	assert(roundTrip.ok && roundTrip.code.indexOf("$$otherwise") !== -1, "Writer lost secondary slot: " + JSON.stringify(roundTrip));
	var runSlots = api("run", { flowSource: roundTrip.code, includeTrace: false });
	assert(runSlots.ok && runSlots.result.a === 1 && runSlots.result.b === 2, "Slot bodies lost: " + JSON.stringify(runSlots));
	assert(runSlots.result.business[0].id === 5 && JSON.stringify(runSlots.result.keys) === '["then"]', "Slot/metadata leaked into business properties");
	var helperSource = 'const _flow = {sourceVersion:2}\nfunction helper() {\n' +
		'proof.holder({$$id:"holder", then:[], $$otherwise:function(){set({path:"result.ok",value:true})}})\n}\n' +
		'function Caller() { helper({$$out:"result.helper"})\n}';
	var helperRun = api("run", { flowSource: helperSource, includeTrace: false });
	assert(helperRun.ok && helperRun.result.helper.ok === true && JSON.stringify(helperRun.result.helper.keys) === '["then"]', "Helper lost its source dialect: " + JSON.stringify(helperRun));
	var again = api("flowSourceValidate", { flowSource: roundTrip.source });
	assert(again.code === roundTrip.code, "Slot writer is not idempotent");
	var unknown = api("flowSourceValidate", { code: slots.replace('$$otherwise:', function () { return '$$missing:'; }) });
	assert(!unknown.ok && JSON.stringify(unknown).indexOf("FLOW_SOURCE_ENGINE_ATTRIBUTE_UNKNOWN") !== -1, "Unknown slot silently accepted");
	var empty = api("flowSourceValidate", { code: slots.replace('set({path:"result.b",value:2})', '') });
	var emptyWritten = api("flowSourceValidate", { flowSource: empty.source });
	assert(emptyWritten.ok && emptyWritten.code.indexOf('$$otherwise: function () {') !== -1, "Empty secondary slot was dropped");
	var collision = api("blockCodeSet", { name: "proof.collision", code: slotCode.replace('then:{},otherwise:{}', 'id:{}') });
	assert(collision.ok, "Collision fixture failed");
	var invalidSlot = api("flowSourceValidate", { code: 'const _flow={sourceVersion:2}\nfunction Invalid(){proof.collision({$$id:function(){}})}' });
	assert(!invalidSlot.ok && JSON.stringify(invalidSlot).indexOf("FLOW_SOURCE_SLOT_NAME_CONFLICT") !== -1, "Slot silently overwrote AST identity");
	print("source-block-dialect OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
