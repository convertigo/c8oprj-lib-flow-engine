const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const vm = require("node:vm");

const documentMarker = "__C8O_FRONT_DOCUMENT__";
const mutationMarker = "__C8O_FLOW_SOURCE_MUTATION__";
const resourceRoot = path.resolve(process.env.FLOW_FRONTBUILDER_RESOURCE_ROOT || process.argv[2] || "");
assert.ok(resourceRoot && fs.statSync(resourceRoot).isDirectory(),
	"Set FLOW_FRONTBUILDER_RESOURCE_ROOT to the frontbuilder Svelte package root");
const sourceManifestFile = path.join(resourceRoot, "provider-dist/provider-manifest.json");
assert.ok(fs.statSync(sourceManifestFile).isFile(), "Run npm run build:provider before the integration test");
const tsxCli = path.join(resourceRoot, "node_modules/tsx/dist/cli.mjs");
assert.ok(fs.statSync(tsxCli).isFile(), "frontbuilder tsx dependency is unavailable");

const serviceSource = fs.readFileSync(path.join(__dirname,
	"../libs/flow/modules/frontend-provider-service.js"), "utf8");
const service = vm.runInNewContext(serviceSource, {});
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

function sha256(value) {
	return crypto.createHash("sha256").update(value).digest("hex");
}

function responseHash(value, fixtureRoot) {
	const normalized = JSON.stringify(value)
		.split(fixtureRoot).join("$FIXTURE_ROOT")
		.split(resourceRoot).join("$RESOURCE_ROOT");
	return sha256(Buffer.from(normalized, "utf8"));
}

function tsxCommand(root, script) {
	return [process.execPath, tsxCli, path.join(root, script)];
}

function selectedCommand(root, script, state) {
	const selection = service.select(root, script, state, env);
	return {
		selection,
		command: selection.kind === "compiled"
			? [process.execPath, selection.bundle]
			: tsxCommand(root, script)
	};
}

async function runDocumentServer(command, requests) {
	const child = spawn(command[0], [...command.slice(1), "--server"], {
		cwd: resourceRoot,
		stdio: ["pipe", "pipe", "pipe"]
	});
	const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
	let stderr = "";
	let sequence = 0;
	let exited = false;
	let exitCode = null;
	child.stderr.on("data", (chunk) => { stderr += String(chunk); });
	child.once("exit", (code) => {
		exited = true;
		exitCode = code;
	});

	async function request(args) {
		const id = `integration-${++sequence}`;
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				cleanup();
				reject(new Error(`provider timeout: ${stderr}`));
			}, 30_000);
			const onLine = (line) => {
				if (!line.startsWith(documentMarker)) return;
				const response = JSON.parse(line.slice(documentMarker.length));
				if (String(response.id || "") !== id) return;
				cleanup();
				if (response.error) reject(new Error(String(response.error)));
				else resolve(response.result);
			};
			const onExit = () => {
				cleanup();
				reject(new Error(`provider exited ${exitCode}: ${stderr}`));
			};
			function cleanup() {
				clearTimeout(timeout);
				lines.off("line", onLine);
				child.off("exit", onExit);
			}
			lines.on("line", onLine);
			child.once("exit", onExit);
			child.stdin.write(`${JSON.stringify({ id, args })}\n`);
		});
	}

	try {
		const responses = {};
		for (const [name, args] of Object.entries(requests)) responses[name] = await request(args);
		child.stdin.end();
		if (!exited) await new Promise((resolve) => child.once("exit", resolve));
		assert.equal(exitCode, 0, stderr);
		return responses;
	} finally {
		lines.close();
		if (!exited) child.kill("SIGKILL");
	}
}

function runMutation(command, args) {
	const child = spawnSync(command[0], [...command.slice(1), ...args], {
		cwd: resourceRoot,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024
	});
	if (child.status !== 0) throw new Error(child.stderr || child.stdout || `provider exited ${child.status}`);
	const line = child.stdout.split(/\r?\n/).findLast((candidate) => candidate.startsWith(mutationMarker));
	if (!line) throw new Error(`provider did not emit ${mutationMarker}`);
	return JSON.parse(line.slice(mutationMarker.length));
}

async function copyProviderRoot() {
	const root = await fsp.mkdtemp(path.join(os.tmpdir(), "flow-provider-integration-"));
	const manifest = JSON.parse(await fsp.readFile(sourceManifestFile, "utf8"));
	await fsp.symlink(path.join(resourceRoot, "node_modules"), path.join(root, "node_modules"), "dir");
	for (const entry of manifest.sources) {
		if (entry.path.startsWith("node_modules/")) continue;
		const target = path.join(root, entry.path);
		await fsp.mkdir(path.dirname(target), { recursive: true });
		await fsp.copyFile(path.join(resourceRoot, entry.path), target);
	}
	for (const name of ["frontDocumentCli.mjs", "sourceMutateCli.mjs", "provider-manifest.json"]) {
		const target = path.join(root, "provider-dist", name);
		await fsp.mkdir(path.dirname(target), { recursive: true });
		await fsp.copyFile(path.join(resourceRoot, "provider-dist", name), target);
	}
	const sourceFile = path.join(root, "fixture", "+page.flow.svelte");
	const sourceText = [
		'<FlowComponent id="home" label="Home">',
		"  <Variables>",
		'    <State id="message" type="string" value="Hello" />',
		"  </Variables>",
		"  <Structure>",
		'    <Text id="title" text="@local.message" />',
		"  </Structure>",
		"</FlowComponent>",
		""
	].join("\n");
	await fsp.mkdir(path.dirname(sourceFile), { recursive: true });
	await fsp.writeFile(sourceFile, sourceText);
	const sourceInput = path.join(root, "source-input.flow.svelte");
	const mutationFile = path.join(root, "mutation.json");
	await fsp.writeFile(sourceInput, sourceText);
	await fsp.writeFile(mutationFile, JSON.stringify({
		op: "replace",
		path: "frontAst.slots.structure.children[0].props.text",
		value: { mode: "literal", value: "Updated" }
	}));
	return { root, sourceFile, sourceInput, mutationFile };
}

function requestsFor(fixture) {
	const base = [
		"--source-file", fixture.sourceFile,
		"--project-root", fixture.root,
		"--project-name", "ProviderContract",
		"--resource-root", resourceRoot,
		"--cache-key", "provider-integration"
	];
	return {
		tree: [...base, "--engine-model", "--source-tree"],
		palette: base,
		picker: [
			...base,
			"--engine-model",
			"--property", "text",
			"--binding-target-source", fixture.sourceFile,
			"--binding-target-path", "frontAst.slots.structure.children[0]"
		]
	};
}

function mutationArgs(fixture) {
	return [
		"--source-file", fixture.sourceFile,
		"--source-input", fixture.sourceInput,
		"--mutation", fixture.mutationFile
	];
}

async function runDirectTsx(fixture) {
	return {
		document: await runDocumentServer(tsxCommand(fixture.root,
			"src-builder/frontDocumentCli.ts"), requestsFor(fixture)),
		mutation: runMutation(tsxCommand(fixture.root,
			"src-builder/sourceMutateCli.ts"), mutationArgs(fixture))
	};
}

async function runSelected(fixture, state) {
	const document = selectedCommand(fixture.root, "src-builder/frontDocumentCli.ts", state);
	let documentResponses;
	let documentFallback = false;
	try {
		documentResponses = await runDocumentServer(document.command, requestsFor(fixture));
	} catch (error) {
		assert.equal(document.selection.kind, "compiled", "tsx fallback itself failed");
		service.reject(document.selection, state, error.message);
		const fallback = selectedCommand(fixture.root, "src-builder/frontDocumentCli.ts", state);
		assert.equal(fallback.selection.reason, "launchRejected");
		documentResponses = await runDocumentServer(fallback.command, requestsFor(fixture));
		documentFallback = true;
	}

	const mutation = selectedCommand(fixture.root, "src-builder/sourceMutateCli.ts", state);
	let mutationResponse;
	let mutationFallback = false;
	try {
		mutationResponse = runMutation(mutation.command, mutationArgs(fixture));
	} catch (error) {
		assert.equal(mutation.selection.kind, "compiled", "tsx fallback itself failed");
		service.reject(mutation.selection, state, error.message);
		const fallback = selectedCommand(fixture.root, "src-builder/sourceMutateCli.ts", state);
		assert.equal(fallback.selection.reason, "launchRejected");
		mutationResponse = runMutation(fallback.command, mutationArgs(fixture));
		mutationFallback = true;
	}
	return {
		response: { document: documentResponses, mutation: mutationResponse },
		selection: {
			document: document.selection.kind + ":" + document.selection.reason,
			mutation: mutation.selection.kind + ":" + mutation.selection.reason,
			documentFallback,
			mutationFallback
		}
	};
}

function updateManifestForBundles(root) {
	const file = path.join(root, "provider-dist/provider-manifest.json");
	const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
	for (const name of ["frontDocumentCli", "sourceMutateCli"]) {
		const bundle = path.join(root, manifest.providers[name].path);
		const content = fs.readFileSync(bundle);
		manifest.providers[name].size = content.length;
		manifest.providers[name].sha256 = sha256(content);
	}
	const payload = {
		format: manifest.format,
		version: manifest.version,
		build: manifest.build,
		sources: manifest.sources,
		providers: manifest.providers
	};
	manifest.payloadSha256 = sha256(Buffer.from(service.stableStringify(payload), "utf8"));
	fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function runCase(name, mutate, expected) {
	const fixture = await copyProviderRoot();
	try {
		await mutate(fixture);
		const baseline = await runDirectTsx(fixture);
		const selected = await runSelected(fixture, {});
		assert.deepEqual(selected.response, baseline, `${name} response differs from tsx`);
		assert.deepEqual(selected.selection, expected, `${name} selected an unexpected provider path`);
		return {
			name,
			selection: selected.selection,
			documentHash: responseHash(selected.response.document, fixture.root),
			mutationHash: responseHash(selected.response.mutation, fixture.root)
		};
	} finally {
		await fsp.rm(fixture.root, { recursive: true, force: true });
	}
}

(async () => {
	const compiled = {
		document: "compiled:valid", mutation: "compiled:valid",
		documentFallback: false, mutationFallback: false
	};
	const fallback = (reason) => ({
		document: `tsx:${reason}`, mutation: `tsx:${reason}`,
		documentFallback: false, mutationFallback: false
	});
	const results = [];
	results.push(await runCase("valid", async () => {}, compiled));
	results.push(await runCase("manifest-absent", async ({ root }) => {
		await fsp.rm(path.join(root, "provider-dist/provider-manifest.json"));
	}, fallback("absent")));
	results.push(await runCase("bundle-absent", async ({ root }) => {
		await fsp.rm(path.join(root, "provider-dist/frontDocumentCli.mjs"));
	}, fallback("absent")));
	results.push(await runCase("source-stale", async ({ root }) => {
		await fsp.appendFile(path.join(root, "src-builder/frontDocument.ts"), "\n// stale fixture\n");
	}, fallback("stale")));
	results.push(await runCase("bundle-corrupt", async ({ root }) => {
		await fsp.appendFile(path.join(root, "provider-dist/frontDocumentCli.mjs"), "\n// corrupt fixture\n");
	}, fallback("corrupt")));
	results.push(await runCase("manifest-corrupt", async ({ root }) => {
		await fsp.writeFile(path.join(root, "provider-dist/provider-manifest.json"), "{broken\n");
	}, fallback("corrupt")));
	results.push(await runCase("launch-impossible", async ({ root }) => {
		await fsp.writeFile(path.join(root, "provider-dist/frontDocumentCli.mjs"),
			"throw new Error('synthetic document launch failure');\n");
		await fsp.writeFile(path.join(root, "provider-dist/sourceMutateCli.mjs"),
			"throw new Error('synthetic mutation launch failure');\n");
		updateManifestForBundles(root);
	}, {
		document: "compiled:valid", mutation: "compiled:valid",
		documentFallback: true, mutationFallback: true
	}));
	const documentHashes = new Set(results.map((result) => result.documentHash));
	const mutationHashes = new Set(results.map((result) => result.mutationHash));
	assert.equal(documentHashes.size, 1, "document hashes differ across fallback scenarios");
	assert.equal(mutationHashes.size, 1, "mutation hashes differ across fallback scenarios");
	console.log(JSON.stringify({ ok: true, results }, null, 2));
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
