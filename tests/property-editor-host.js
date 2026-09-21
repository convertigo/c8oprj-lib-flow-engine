// Exercise the real host bridge with a minimal DOM adapter, not private source strings.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../_flow/resources/property-editor.js"), "utf8");
function host(tag) {
	const messages = [], listeners = {}, requests = [], domListeners = {};
	const app = { innerHTML: "", className: "" };
	const editor = {
		value: "", valid: true,
		setState(state) { this.state = state; this.value = state.value; },
		getAttribute(name) { return name === "data-key" ? "value" : null; },
		addEventListener(name, callback) { listeners[name] = callback; }
	};
	const document = {
		documentElement: { style: {}, setAttribute() {}, removeAttribute() {} },
		getElementById(id) { assert.equal(id, "app"); return app; },
		querySelector(selector) {
			if (selector === "[data-key]" || selector === tag + "[data-key]" || selector === "[data-picker-editor]") return editor;
			return null;
		},
		addEventListener(name, callback) { domListeners[name] = callback; }
	};
	const window = { flowEditor: {
		receive(message) { messages.push(JSON.parse(message)); },
		request(message) { requests.push(JSON.parse(message)); return '{"ok":true}'; }
	} };
	vm.runInNewContext(source, { window, document, customElements: { get(name) { return name === tag; } } });
	return { window, document, app, editor, messages, requests, listeners, domListeners };
}

for (const definition of [
	{ kind: "text" },
	{ kind: "customType", editorClass: "acme-value-editor" }
]) {
	const tag = definition.editorClass || "flow-text-editor";
	const h = host(tag);
	h.window.receiveFromJava({ mode: "property", embedded: true, virtualPath: "config.service.value",
		property: "value", propertyDefinition: definition, value: "Initial", theme: "dark" });
	assert.match(h.app.innerHTML, /wrap single embedded/);
	assert.ok(h.app.innerHTML.includes("<" + tag + " "), "the descriptor chooses the editor, even for a new type");
	assert.doesNotMatch(h.app.innerHTML, /data-apply|data-reset|<h1|Scope picker/,
		"embedded custom editors must not duplicate host actions or chrome");
	assert.equal(h.editor.state.value, "Initial");
	assert.deepEqual(h.messages.at(-1), { type: "value", value: "Initial", valid: true, error: "" });
	h.listeners["flow-value"]({ detail: { value: "Draft" } });
	assert.equal(h.messages.at(-1).value, "Draft");
	h.listeners["flow-value"]({ detail: { value: "Invalid", valid: false, error: "Invalid value" } });
	assert.deepEqual(h.messages.at(-1), { type: "value", value: "Invalid", valid: false, error: "Invalid value" });
	h.window.flowSetContext({ tokens: [] });
	assert.equal(h.editor.state.value, "Invalid", "context refresh must preserve the uncommitted draft");
	h.editor.flowHost.request("context", {});
	assert.equal(h.requests.at(-1).payload.property, "value");
	assert.ok(h.messages.every(message => message.type === "value"), "editing must never implicitly save");
	h.window.receiveFromJava({ mode: "property", embedded: false, property: "value",
		propertyDefinition: definition, value: "Reloaded", summary: "Setting" });
	assert.match(h.app.innerHTML, /<h1>Setting<\/h1>/);
	assert.doesNotMatch(h.app.innerHTML, /wrap single embedded/);
	assert.equal(h.editor.state.value, "Reloaded");
	const picker = host(tag);
	picker.window.receiveFromJava({ mode: "picker", virtualPath: "config.service.value",
		definition: { props: { value: "Initial" } }, info: { propertyDefinitions: { value: definition } } });
	assert.ok(picker.app.innerHTML.includes("<" + tag + " "), "the Source Picker must use the same declared editor as the dialogue");
	assert.equal(picker.editor.state.value, "Initial");
	picker.listeners["flow-value"]({ detail: { value: "Picked draft" } });
	assert.equal(picker.messages.length, 0, "picker changes stay local until Apply");
	picker.domListeners.click({ target: { getAttribute(name) { return name === "data-apply-picked" ? "true" : null; } } });
	assert.deepEqual(picker.messages.at(-1), { type: "setProperty", property: "value", value: "Picked draft" });
}
console.log("property-editor-host tests passed");
