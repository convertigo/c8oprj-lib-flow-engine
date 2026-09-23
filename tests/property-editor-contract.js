// Integration: actual descriptors, types and AST projection, without a Studio.
var engineDir = new java.io.File(arguments[0] || "_flow").getAbsoluteFile();
var __flowEngineDir = String(engineDir);
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-property-contract-"));
var engine = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function assert(value, message) { if (!value) throw new Error(message); }
function find(node, path) {
	if (node.path === path) return node;
	for (var i = 0; i < (node.children || []).length; i++) {
		var found = find(node.children[i], path);
		if (found) return found;
	}
}
var source = 'const _flow = { sourceVersion: 2 };\nfunction Example() {\n'
	+ 'number.add({ $$id: "sum", left: 1, right: 2, $$out: "local.sum" });\n'
	+ 'number.subtract({ $$id: "difference", left: 4, right: 2 });\n'
	+ 'log({ message: "{{ local.sum }}" });\n'
	+ 'debug.probe({ label: "{{ local.sum }}", value: 1 });\n'
	+ 'throw({ message: "{{ local.sum }}" });\n'
	+ 'set({ path: "local.value", value: 1 });\n'
	+ 'set({ path: "local.value", value: 2, $$out: "local.existingCapture" });\n}';
var tree = JSON.parse(engine.describeTree(JSON.stringify({ target: "flow", flowSource: source, flowName: "Example" })));
assert(tree.ok !== false, JSON.stringify(tree));
function info(index) { return JSON.parse(find(tree, "nodes[" + index + "]").info); }
[[0, "left", "flow-value-editor"], [0, "right", "flow-value-editor"],
	[1, "left", "flow-value-editor"], [1, "right", "flow-value-editor"],
	[2, "message", "flow-template-editor"], [3, "label", "flow-template-editor"],
	[4, "message", "flow-template-editor"], [0, "$$out", "flow-path-editor"]].forEach(function (entry) {
	var def = info(entry[0]).propertyDefinitions[entry[1]];
	assert(def.editorMode === "custom" && def.editorClass === entry[2], "Missing dynamic editor: " + JSON.stringify(entry) + " " + JSON.stringify(def));
});
assert(info(0).blockType === "number.add", "Block identity must not require reading the source filename");
assert(info(0).propertyDefinitions.blockType.readOnly === true, "Block identity is information");
assert(info(0).propertyDefinitions.$$comment.editorMode === "text", "Comments keep their simple native editor");
assert(info(0).propertyDefinitions.$$disabled.editorMode === "choice", "Boolean is a provider-declared choice");
assert(JSON.stringify(info(0).propertyDefinitions.$$disabled.enum) === "[false,true]", "Choices supplied by the provider");
assert(info(2).propertyDefinitions.$$out.hidden === true, "Logging has no public Output by default");
assert(info(2).propertyDefinitions.logger.editorClass === "flow-literal-editor"
	&& JSON.stringify(info(2).propertyDefinitions.logger.enum) === '["context","engine","user","audit","beans"]',
	"Logger is a declared choice, not a free-form dynamic message");
assert(info(2).propertyDefinitions.level.editorClass === "flow-literal-editor"
	&& info(2).propertyDefinitions.level.enum.indexOf("warn") >= 0, "Log levels expose their supported choices");
assert(info(5).propertyDefinitions.$$out.hidden === true, "Set must not display a second Output");
assert(info(6).propertyDefinitions.$$out.hidden === false && info(6).propertyDefinitions.$$out.category === "Expert",
	"Existing result captures remain editable, never silently discarded");
var fixture = JSON.parse(engine.blockCodeSet(JSON.stringify({ name: "proof.metadata", code:
	'const _meta = {sourceVersion:2,runtime:"rhino",properties:{blockType:{kind:"value",type:"string"},_blockType:{kind:"text",type:"string"},blockSource:{kind:"text",type:"string"}}}\n'
	+ '(function(){return {run:function(){return null;}};}())' })));
assert(fixture.ok, "Create private metadata collision fixture: " + JSON.stringify(fixture));
var collisionTree = JSON.parse(engine.describeTree(JSON.stringify({ target: "flow", flowSource:
	'const _flow={sourceVersion:2};\nfunction Collision(){proof.metadata({blockType:"business",_blockType:"another",blockSource:"customer"});\n}' })));
var collision = JSON.parse(find(collisionTree, "nodes[0]").info);
assert(collision.propertyDefinitions.blockType.definitionPath === "props.blockType"
	&& !collision.propertyDefinitions.blockType.readOnly, "Information must not replace a business property's editor");
assert(collision.propertyDefinitions.blockSource.definitionPath === "props.blockSource"
	&& !collision.propertyDefinitions.blockSource.readOnly, "Source information must not replace a business field");
assert(collision.__blockType === "proof.metadata" && collision.propertyDefinitions.__blockType.readOnly,
	"Public block identity must remain available despite a name collision");
print("property-editor-contract OK: backend pickers, engine fields, block identity");
