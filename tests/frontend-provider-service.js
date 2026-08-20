const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname,
	"../libs/flow/modules/frontend-provider-service.js"), "utf8");
const service = vm.runInNewContext(source, {});
const root = fs.mkdtempSync(path.join(os.tmpdir(), "flow-provider-service-"));
let clock = 1_800_000_000;

function sha256(value) {
	return crypto.createHash("sha256").update(value).digest("hex");
}

function write(relativePath, content) {
	const file = path.join(root, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
	clock += 1;
	fs.utimesSync(file, clock, clock);
	return file;
}

function fingerprint(relativePath) {
	const file = path.join(root, relativePath);
	const content = fs.readFileSync(file);
	return { path: relativePath, size: content.length, sha256: sha256(content) };
}

const sourcePaths = [
	"package.json",
	"package-lock.json",
	"tsconfig.json",
	"src-builder/buildProvider.mjs",
	"src-builder/frontDocumentCli.ts",
	"src-builder/sourceMutateCli.ts",
	"src-builder/helper.ts"
];
for (const file of sourcePaths) write(file, `source:${file}\n`);
write("provider-dist/frontDocumentCli.mjs", "console.log('document');\n");
write("provider-dist/sourceMutateCli.mjs", "console.log('mutation');\n");

function writeManifest(overrides = {}) {
	const payload = {
		format: "convertigo-flow-svelte-provider",
		version: 1,
		build: {
			tool: "esbuild",
			toolVersion: "test",
			bundle: true,
			platform: "node",
			moduleFormat: "esm",
			target: "node20",
			packages: "external",
			entryPoints: {
				frontDocumentCli: "src-builder/frontDocumentCli.ts",
				sourceMutateCli: "src-builder/sourceMutateCli.ts"
			}
		},
		sources: sourcePaths.map(fingerprint),
		providers: {
			frontDocumentCli: {
				source: "src-builder/frontDocumentCli.ts",
				...fingerprint("provider-dist/frontDocumentCli.mjs")
			},
			sourceMutateCli: {
				source: "src-builder/sourceMutateCli.ts",
				...fingerprint("provider-dist/sourceMutateCli.mjs")
			}
		},
		...overrides
	};
	const manifest = {
		...payload,
		payloadSha256: sha256(service.stableStringify(payload))
	};
	write("provider-dist/provider-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest;
}

const env = {
	canonical: (value) => fs.realpathSync(value),
	resolve: (base, value) => path.resolve(base, value),
	fileInfo: (file) => {
		try {
			const info = fs.statSync(file);
			return { exists: info.isFile(), size: info.size, mtime: info.mtimeMs };
		} catch {
			return { exists: false, size: -1, mtime: -1 };
		}
	},
	readText: (file) => fs.readFileSync(file, "utf8"),
	sha256Text: (value) => sha256(Buffer.from(value, "utf8")),
	sha256File: (file) => sha256(fs.readFileSync(file))
};
const state = {};

try {
	writeManifest();
	const document = service.select(root, "src-builder/frontDocumentCli.ts", state, env);
	assert.equal(document.kind, "compiled");
	assert.equal(document.reason, "valid");
	assert.equal(document.bundle, fs.realpathSync(path.join(root, "provider-dist/frontDocumentCli.mjs")));
	const mutation = service.select(root, "src-builder/sourceMutateCli.ts", state, env);
	assert.equal(mutation.kind, "compiled");
	assert.equal(state.stats.validations, 1);
	assert.equal(state.stats.validationCacheHits, 1);

	const manifestFile = path.join(root, "provider-dist/provider-manifest.json");
	const savedManifest = fs.readFileSync(manifestFile);
	fs.rmSync(manifestFile);
	assert.equal(service.select(root, "src-builder/frontDocumentCli.ts", state, env).reason, "absent");
	write("provider-dist/provider-manifest.json", savedManifest);
	assert.equal(service.select(root, "src-builder/frontDocumentCli.ts", state, env).kind, "compiled");

	write("src-builder/helper.ts", "source:changed\n");
	const stale = service.select(root, "src-builder/frontDocumentCli.ts", state, env);
	assert.equal(stale.kind, "tsx");
	assert.equal(stale.reason, "stale");
	assert.match(stale.details, /helper\.ts/);
	writeManifest();
	assert.equal(service.select(root, "src-builder/frontDocumentCli.ts", state, env).kind, "compiled");

	fs.rmSync(path.join(root, "provider-dist/sourceMutateCli.mjs"));
	assert.equal(service.select(root, "src-builder/frontDocumentCli.ts", state, env).reason, "absent");
	write("provider-dist/sourceMutateCli.mjs", "console.log('mutation');\n");
	writeManifest();

	write("provider-dist/frontDocumentCli.mjs", "console.log('corrupt');\n");
	const corruptBundle = service.select(root, "src-builder/frontDocumentCli.ts", state, env);
	assert.equal(corruptBundle.kind, "tsx");
	assert.equal(corruptBundle.reason, "corrupt");
	assert.match(corruptBundle.details, /frontDocumentCli\.mjs/);
	write("provider-dist/frontDocumentCli.mjs", "console.log('document');\n");
	writeManifest();

	const validBeforeReject = service.select(root, "src-builder/frontDocumentCli.ts", state, env);
	service.reject(validBeforeReject, state, "synthetic launch failure");
	const rejected = service.select(root, "src-builder/frontDocumentCli.ts", state, env);
	assert.equal(rejected.kind, "tsx");
	assert.equal(rejected.reason, "launchRejected");
	assert.match(rejected.details, /synthetic launch failure/);

	write("provider-dist/provider-manifest.json", "{broken\n");
	assert.equal(service.select(root, "src-builder/frontDocumentCli.ts", state, env).reason, "corrupt");
	service.clear(state);
	assert.deepEqual(Object.keys(state.cache), []);
	assert.deepEqual(Object.keys(state.rejected), []);
	assert.deepEqual(Object.keys(state.stats), []);
	console.log("frontend-provider-service tests passed");
} finally {
	fs.rmSync(root, { recursive: true, force: true });
}
