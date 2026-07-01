(function () {
	function frontbuilderSettings(config) {
		var root = config && config.frontbuilder;
		if (!root || typeof root !== "object") {
			return [];
		}
		return Object.keys(root).sort().map(function (key) {
			var settings = root[key];
			if (!settings || typeof settings !== "object") {
				settings = {};
			}
			return {
				name: key,
				settings: settings
			};
		});
	}

	function resolveFile(base, value, env) {
		var path = String(value || "").trim();
		if (!path) {
			return null;
		}
		var file = new env.File(path);
		if (!file.isAbsolute()) {
			file = new env.File(base, path);
		}
		return file;
	}

	function resourceRootForSettings(settings, env) {
		var projectRoot = env.projectDir();
		if (!projectRoot) {
			return null;
		}
		return resolveFile(projectRoot, settings.resourceRoot || "", env);
	}

	function sortedFiles(dir, env) {
		var files = dir && dir.listFiles();
		if (!files) {
			return [];
		}
		files = env.Arrays.asList(files).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		return files;
	}

	function collectUiBlockFiles(dir, env, out) {
		sortedFiles(dir, env).forEach(function (file) {
			if (file.isDirectory()) {
				collectUiBlockFiles(file, env, out);
				return;
			}
			if (file.isFile() && String(file.getName()).endsWith(".uiblock.json")) {
				out.push(file);
			}
		});
	}

	function normalizeUiBlock(raw, file, builderName, settings, env) {
		raw = env.normalizeTree(raw || {});
		var id = String(raw.id || "").trim();
		if (!id) {
			id = builderName + "." + String(file.getName()).replace(/\.uiblock\.json$/, "");
		}
		var insert = raw.insert || {};
		var descriptor = {
			id: id,
			name: raw.name || raw.label || id,
			label: raw.label || raw.name || id,
			category: raw.category || "Svelte / Widgets",
			kind: raw.kind || "widget",
			targetKinds: raw.targetKinds || ["frontendComponent", "frontendWidget"],
			description: raw.description || "",
			icon: raw.icon || "mdi:view-module-outline",
			insert: insert,
			defaults: raw.defaults || insert,
			properties: raw.properties || {},
			builder: builderName,
			target: settings.target || "",
			provider: raw.provider || settings.provider || "frontbuilder." + builderName,
			sourcePath: String(file.getAbsolutePath()),
			file: String(file.getAbsolutePath()),
			sourceWritable: false
		};
		if (typeof env.resolveBlockIcon === "function") {
			env.resolveBlockIcon({
				__flowFile: String(file.getAbsolutePath())
			}, descriptor);
		}
		return descriptor;
	}

	function frontendBlocksForSettings(name, settings, env) {
		settings = settings || {};
		var root = resourceRootForSettings(settings, env);
		if (!root || !root.isDirectory()) {
			return [];
		}
		var uiDir = new env.File(root, "ui");
		var files = [];
		collectUiBlockFiles(uiDir, env, files);
		return files.map(function (file) {
			try {
				var raw = JSON.parse(String(env.FileUtils.readFileToString(file, "UTF-8")));
				return normalizeUiBlock(raw, file, name, settings, env);
			} catch (e) {
				return {
					id: name + ".invalid." + String(file.getName()).replace(/\.uiblock\.json$/, ""),
					name: String(file.getName()),
					label: String(file.getName()),
					category: "Svelte / Invalid",
					kind: "error",
					targetKinds: [],
					description: String(e && e.message || e),
					icon: "mdi:alert-outline",
					insert: {},
					builder: name,
					target: settings.target || "",
					provider: "frontbuilder." + name,
					sourcePath: String(file.getAbsolutePath()),
					file: String(file.getAbsolutePath()),
					sourceWritable: false,
					error: String(e && e.message || e)
				};
			}
		});
	}

	function frontendBlocksForConfig(config, env) {
		var out = [];
		frontbuilderSettings(config).forEach(function (entry) {
			out = out.concat(frontendBlocksForSettings(entry.name, entry.settings, env));
		});
		return out;
	}

	function fingerprintForConfig(config, env) {
		var parts = [];
		frontbuilderSettings(config).forEach(function (entry) {
			var root = resourceRootForSettings(entry.settings, env);
			var uiDir = root ? new env.File(root, "ui") : null;
			parts.push(entry.name);
			parts.push(root && root.exists() ? env.canonicalPath(root) : "");
			parts.push(uiDir && uiDir.exists() ? env.directoryFingerprint(uiDir) : "");
		});
		return parts.join("\n");
	}

	return {
		frontbuilderSettings: frontbuilderSettings,
		resourceRootForSettings: resourceRootForSettings,
		frontendBlocksForSettings: frontendBlocksForSettings,
		frontendBlocksForConfig: frontendBlocksForConfig,
		fingerprintForConfig: fingerprintForConfig
	};
}())
