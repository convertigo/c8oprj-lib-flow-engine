const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../libs/flow/modules/catalog-loader-service.js"), "utf8");
const loader = vm.runInNewContext(source, {});

class FakeFile {
	constructor(parent, child) {
		this.path = child === undefined ? String(parent) : `${parent.path || parent}/${child}`;
	}
	getName() { return this.path.split("/").pop(); }
	getParentFile() { return new FakeFile(this.path.replace(/\/[^/]+$/, "")); }
	isDirectory() { return this.path === "/engine/blocks"; }
	isFile() { return this.path.endsWith(".block.js"); }
	listFiles() {
		return this.path === "/engine/blocks"
			? [new FakeFile(this, "first.block.js"), new FakeFile(this, "second.block.js")]
			: [];
	}
}

let reserves = 0;
let loads = 0;
const env = {
	File: FakeFile,
	Arrays: { asList: (items) => ({ toArray: () => [...items] }) },
	engineDir: () => "/engine",
	projectDir: () => null,
	projectBlocksDir: () => null,
	canonicalPath: (value) => value.path || String(value),
	directoryFingerprint: () => "fingerprint",
	sourceDraftsFingerprint: () => "",
	flowProviderName: () => "lib_flow_engine",
	readRuntimeCache: () => null,
	writeRuntimeCache: (_cache, _key, _fingerprint, value) => value,
	coreBlockCache: {},
	loadFlowScriptBlockFile: () => { loads += 1; },
	reserveFlowScriptBlockFile: (blocks, value) => {
		reserves += 1;
		blocks[value.getName()] = { __flowScriptPlaceholder: true };
	},
};

const blocks = loader.loadBlocksUncached(env);
assert.strictEqual(reserves, 2);
assert.strictEqual(loads, 0, "loading the core catalog should not compile every block runner");
assert.strictEqual(Object.keys(blocks).length, 2);

console.log("catalog loader lazy core tests passed");
