const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../libs/flow/modules/catalog-loader-service.js"), "utf8");
const catalogLoader = vm.runInNewContext(source, {});

class FakeFile {
	constructor(parent, child) {
		this.path = child === undefined ? String(parent) : `${parent}/${child}`;
	}
	toString() {
		return this.path;
	}
}

const sentinel = { cached: true };
const headKey = "engine\n/engine\nproject\n/project";
let now = 59000;
let fingerprintCalls = 0;

const env = {
	File: FakeFile,
	engineDir: () => "/engine",
	projectDir: () => "/project",
	projectBlocksDir: () => null,
	canonicalPath: (file) => String(file),
	directoryFingerprint: () => {
		fingerprintCalls += 1;
		return "fingerprint";
	},
	sourceDraftsFingerprint: () => "",
	readRuntimeCache: () => sentinel,
	writeRuntimeCache: () => sentinel,
	blockCache: {},
	coreBlockCache: {},
	blockCatalogHeadCache: {
		entries: {
			[headKey]: { value: sentinel, checkedAt: 0 },
		},
		hits: 0,
		misses: 0,
	},
	currentTimeMillis: () => now,
};

assert.strictEqual(catalogLoader.loadBlocks(env, true), sentinel);
assert.strictEqual(fingerprintCalls, 0, "the default hot window must avoid filesystem fingerprints for 60 seconds");
assert.strictEqual(env.blockCatalogHeadCache.hits, 1);

now = 60000;
assert.strictEqual(catalogLoader.loadBlocks(env, true), sentinel);
assert.strictEqual(fingerprintCalls, 1, "the fallback probe must still run after the hot window expires");
assert.strictEqual(env.blockCatalogHeadCache.misses, 1);
assert.strictEqual(sentinel.__flowCatalogFingerprint, "engine\n/engine\ncore\nfingerprint");
assert.strictEqual(Object.keys(sentinel).includes("__flowCatalogFingerprint"), false,
	"the execution fingerprint must not appear as a Flow block");

console.log("catalog-loader-hot-cache tests passed");
