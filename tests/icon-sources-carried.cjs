// Every Iconify icon displayed by lib_flow_engine (blocks, types, tree nodes, catalog entries) is
// carried as an SVG source in _flow/icons/iconify/<set>/, so a server without network nor cache
// still shows it. A missing file, or a name absent from the icon set, otherwise fails silently at
// run time: the download leaves a ".failed" marker in the server cache and the node has no icon.
const fs = require("fs");
const path = require("path");

const flowDir = path.resolve(__dirname, "../_flow");
const iconsDir = path.join(flowDir, "icons/iconify");
// Named in descriptions and placeholders as examples of the syntax, never displayed.
const EXAMPLES = new Set(["mdi:power", "mdi:format-letter-case"]);
const sets = fs.readdirSync(iconsDir).filter((name) => fs.statSync(path.join(iconsDir, name)).isDirectory());
const reference = new RegExp("(?:^|[^a-z0-9-])(" + sets.join("|") + "):([a-z0-9]+(?:-[a-z0-9]+)*)", "g");
const missing = new Map();
let references = 0;

(function walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const file = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (file !== path.join(flowDir, "icons") && entry.name !== "node_modules") walk(file);
		} else if (/\.(c?js|mjs|ts|json|ya?ml|html|svelte)$/.test(entry.name)) {
			for (const match of fs.readFileSync(file, "utf8").matchAll(reference)) {
				const id = match[1] + ":" + match[2];
				if (EXAMPLES.has(id)) continue;
				references++;
				if (!fs.existsSync(path.join(iconsDir, match[1], match[2] + ".svg"))) {
					missing.set(id, path.relative(flowDir, file));
				}
			}
		}
	}
})(flowDir);

for (const set of sets) {
	if (!fs.existsSync(path.join(iconsDir, set, "LICENSE.json"))) missing.set(set + ":LICENSE.json", "icons/iconify/" + set);
}
if (missing.size) {
	console.error("Icons displayed but not carried as SVG sources (add the SVG, or use a name of the set):");
	for (const [id, file] of missing) console.error("  " + id + " (" + file + ")");
	process.exit(1);
}
if (!references) {
	console.error("No icon reference found: the scan is broken");
	process.exit(1);
}
console.log("icon-sources-carried OK (" + references + " references, sets: " + sets.join(", ") + ")");
