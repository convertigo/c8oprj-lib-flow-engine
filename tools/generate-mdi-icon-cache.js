#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const flowDir = path.join(root, "libs/flow");
const blocksDir = path.join(flowDir, "blocks");
const outDir = path.join(root, "libs/flow/icons/iconify/mdi");

function mdiJsonPath() {
	const explicit = process.argv[2] || process.env.ICONIFY_MDI_JSON;
	if (explicit) {
		return explicit;
	}
	try {
		return require.resolve("@iconify-json/mdi/icons.json");
	} catch {
		throw new Error("Pass @iconify-json/mdi/icons.json path as first argument or set ICONIFY_MDI_JSON.");
	}
}

function blockIconNames() {
	const names = new Set();
	for (const file of iconSourceFiles()) {
		const source = fs.readFileSync(file, "utf8");
		for (const match of source.matchAll(/["']mdi:([A-Za-z0-9_.-]+)["']/g)) {
			names.add(match[1]);
		}
	}
	return Array.from(names).sort();
}

function iconSourceFiles() {
	const files = [path.join(flowDir, "Engine.js")];
	for (const file of fs.readdirSync(blocksDir)) {
		if (file.endsWith(".js")) {
			files.push(path.join(blocksDir, file));
		}
	}
	return files;
}

function svgForIcon(data, name) {
	const icon = data.icons[name];
	if (!icon) {
		throw new Error(`Missing mdi:${name}`);
	}
	const width = icon.width || data.width || 24;
	const height = icon.height || data.height || 24;
	const color = "#14a7cf";
	const body = String(icon.body).replace(/currentColor/g, color);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="${color}">${body}</g></svg>`;
}

function convertigoRoot() {
	const candidates = [
		process.env.CONVERTIGO_ROOT,
		path.resolve(root, "../convertigo"),
		path.resolve(root, "../convertigo-hotfix")
	].filter(Boolean);
	for (const candidate of candidates) {
		if (fs.existsSync(path.join(candidate, "convertigo-svg-icons/build.gradle"))) {
			return candidate;
		}
	}
	throw new Error("Set CONVERTIGO_ROOT to a Convertigo checkout containing convertigo-svg-icons.");
}

function dependenciesClasspath(c8oRoot) {
	if (process.env.C8O_DEPENDENCIES_JAR) {
		return process.env.C8O_DEPENDENCIES_JAR;
	}
	const libsDir = path.join(c8oRoot, "engine/build/libs");
	const jars = fs.readdirSync(libsDir)
		.filter((file) => /^dependencies-.*\.jar$/.test(file))
		.filter((file) => !file.includes("-sources-"))
		.map((file) => path.join(libsDir, file))
		.sort();
	if (jars.length === 0) {
		throw new Error(`No dependencies jar found in ${libsDir}. Build engineDependenciesClasspathJar first.`);
	}
	return [jars[jars.length - 1], ...svgApiJars()].join(path.delimiter);
}

function svgApiJars() {
	const candidates = [
		path.join(os.homedir(), ".m2/repository/xml-apis/xml-apis-ext/1.3.04/xml-apis-ext-1.3.04.jar"),
		path.join(os.homedir(), ".m2/repository/xml-apis/xml-apis/1.4.01/xml-apis-1.4.01.jar")
	].filter((file) => fs.existsSync(file));
	return [...candidates, ...gradleModuleJars("org.apache.xmlgraphics/batik-ext")];
}

function gradleModuleJars(modulePath) {
	const moduleRoot = path.join(os.homedir(), ".gradle/caches/modules-2/files-2.1", modulePath);
	if (!fs.existsSync(moduleRoot)) {
		return [];
	}
	const out = [];
	for (const version of fs.readdirSync(moduleRoot)) {
		const versionDir = path.join(moduleRoot, version);
		if (!fs.statSync(versionDir).isDirectory()) {
			continue;
		}
		for (const hash of fs.readdirSync(versionDir)) {
			const hashDir = path.join(versionDir, hash);
			if (!fs.statSync(hashDir).isDirectory()) {
				continue;
			}
			for (const file of fs.readdirSync(hashDir)) {
				if (file.endsWith(".jar") && !file.includes("-sources-")) {
					out.push(path.join(hashDir, file));
				}
			}
		}
	}
	return out.sort().slice(-1);
}

function generatePngIcons() {
	const c8oRoot = convertigoRoot();
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "c8o-flow-icons-java-"));
	try {
		const source = path.join(c8oRoot, "convertigo-svg-icons/src/com/convertigo/icons/MakeIcons.java");
		const classpath = dependenciesClasspath(c8oRoot);
		execFileSync("javac", ["-proc:none", "-cp", classpath, "-d", tmpDir, source], {
			stdio: "inherit"
		});
		execFileSync("java", ["-cp", `${tmpDir}${path.delimiter}${classpath}`, "com.convertigo.icons.MakeIcons", outDir], {
			stdio: "inherit"
		});
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
}

function cleanGeneratedPngs() {
	for (const file of fs.readdirSync(outDir)) {
		if (/_\d+x\d+\.png$/.test(file)) {
			fs.rmSync(path.join(outDir, file), { force: true });
		}
	}
}

function cleanStaleSvgs(names) {
	const keep = new Set(names.map((name) => `${name}.svg`));
	for (const file of fs.readdirSync(outDir)) {
		if (file.endsWith(".svg") && !keep.has(file)) {
			fs.rmSync(path.join(outDir, file), { force: true });
		}
	}
}

const data = JSON.parse(fs.readFileSync(mdiJsonPath(), "utf8"));
fs.mkdirSync(outDir, { recursive: true });
const names = blockIconNames();
cleanGeneratedPngs();
cleanStaleSvgs(names);
for (const name of names) {
	const svg = svgForIcon(data, name);
	fs.writeFileSync(path.join(outDir, `${name}.svg`), svg);
}
generatePngIcons();
console.log(`Generated ${names.length} MDI SVG files and PNG variants in ${outDir}`);
