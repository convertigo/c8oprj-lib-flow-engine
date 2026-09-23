const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname,
	"../_flow/modules/property-editor-builder.js"), "utf8");
const builder = vm.runInNewContext(source, {});
const root = fs.mkdtempSync(path.join(os.tmpdir(), "flow-property-editor-builder-"));
const bindingEditor = fs.readFileSync(path.join(__dirname, "../_flow/types/editors/binding.html"), "utf8");
const colorEditor = fs.readFileSync(path.join(__dirname, "../_flow/types/editors/color.html"), "utf8");
const themeEditor = fs.readFileSync(path.join(__dirname, "../_flow/types/editors/theme.html"), "utf8");
const propertyEditor = fs.readFileSync(path.join(__dirname, "../_flow/resources/property-editor.js"), "utf8");

function write(relativePath, content) {
	const file = path.join(root, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
	return file;
}

try {
	write("resources/property-editor.html",
		"<style><!-- FLOW_PROPERTY_EDITOR_STYLE --></style><!-- FLOW_TYPE_EDITOR_FRAGMENTS --><script><!-- FLOW_PROPERTY_EDITOR_SCRIPT --></script>");
	write("resources/property-editor.css", ":root { font-size: 12px; }");
	write("resources/property-editor.js", "window.ready = true;");
	write("destination-contract.js", fs.readFileSync(path.join(__dirname, "../_flow/modules/destination-contract.js"), "utf8"));
	write("schema-contract.js", fs.readFileSync(path.join(__dirname, "../_flow/modules/schema-contract.js"), "utf8"));
	write("property-value-codec.js", fs.readFileSync(path.join(__dirname, "../_flow/modules/property-value-codec.js"), "utf8"));
	write("resources/type-editor-chrome.css",
		":host { font-size: 12px; }\n@media (pointer: fine) { input { min-height: 32px; } }");
	const editorFile = write("editors/test.html",
		"<template><style>:host { font: 12px system-ui; }\n@media (max-width: 640px) { input { font-size: 16px; } }</style><input></template>");
	const plainEditorFile = write("editors/plain.html", "<template><input></template>");

	const env = {
		File: class File {
			constructor(parent, child) {
				this.path = child === undefined ? String(parent) : path.join(parent.path || String(parent), String(child));
			}
			isAbsolute() { return path.isAbsolute(this.path); }
			isFile() { return fs.statSync(this.path).isFile(); }
			getParentFile() { return new env.File(path.dirname(this.path)); }
			getAbsolutePath() { return this.path; }
		},
		FileUtils: { readFileToString: (file) => fs.readFileSync(file.path || file, "utf8") },
		engineResourceFile: (name) => new env.File(path.join(root, "resources", name)),
		engineModuleFile: (name) => new env.File(path.join(root, name === "property-editor-builder.js" ? "builder.js" : name)),
		engineDir: () => new env.File(root),
		loadTypes: () => ({
			plain: { editor: { file: plainEditorFile } },
			test: { editor: { file: editorFile } }
		}),
		typeDescriptor: (type) => ({ name: type.editor.file === plainEditorFile ? "plain" : "test" }),
		canonicalPath: (file) => file.path,
		fileFingerprint: (file) => fs.readFileSync(file.path || file, "utf8"),
		typesCacheKey: () => "types-v1",
		raise: (code, message) => { throw new Error(code + ": " + message); }
	};

	write("builder.js", source);
	const html = builder.html(env);
	const testFragment = html.indexOf("Flow type editor: test");
	const localRule = html.indexOf("@media (max-width: 640px)", testFragment);
	const sharedRule = html.indexOf("@media (pointer: fine)", localRule);
	assert(localRule >= 0 && sharedRule > localRule,
		"shared chrome must follow editor-local styles so it can normalize control density");
	assert.equal((html.match(/Shared Flow type editor chrome/g) || []).length, 2,
		"every type editor template must receive the shared chrome, including style-less editors");
	assert.match(html, /window\.ready = true/);
	assert.match(html, /window\.FlowDestinationContract = /);
	assert.match(html, /window\.FlowSchemaContract = /);
	assert.match(bindingEditor, /data-part-literal-custom/,
		"Compose must host the custom literal editor declared by literalType");
	assert.match(colorEditor, /data-custom-mode="auto"/);
	assert.match(colorEditor, /Generated Flow shades from 50 to 950/);
	assert.match(themeEditor, /customElements\.define\("flow-theme-editor"/);
	assert.match(themeEditor, /data-tab="colors"/);
	assert.match(themeEditor, />Same<\/option>.*>Auto<\/option>.*>Choose<\/option>/s);
	assert.match(themeEditor, /Semantic tokens drive every component/);
	assert.match(propertyEditor, /window\.flowSetContext/,
		"the host must be able to refresh runtime theme context without reloading the picker");
	assert.match(propertyEditor, /selectedPropertyDoc/,
		"the picker must explain the property selected from the multi-property target list");

	const before = builder.cacheKey(env);
	write("resources/type-editor-chrome.css", ":host { font-size: 13px; }");
	const after = builder.cacheKey(env);
	assert.notEqual(after, before, "shared chrome changes must invalidate the property editor cache");
	write("destination-contract.js", "({validate: function () {return {valid:false};}})");
	assert.notEqual(builder.cacheKey(env), after, "destination policy changes must invalidate editor HTML");

	console.log("property-editor-builder tests passed");
} finally {
	fs.rmSync(root, { recursive: true, force: true });
}
