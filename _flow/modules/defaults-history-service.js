(function () {
	// Shrink / unshrink across versions (see the Flow CIR design note on defaults).
	// A property equal to its default is not written; to read a source back, the
	// default that applies is the one of the definer version the source was written
	// against. A definition file may have a companion history (only for properties
	// whose default changed):
	//   mock.block.js -> mock.block.defaults.json, Card.flow.svelte -> Card.flow.defaults.json
	//   { "format": "convertigo-flow-defaults", "history": [ { "until": "8.4.0", "props": { ... } } ] }
	// A project records in _flow/dependencies.json the version of each definer project
	// it uses; its own definitions always use their current defaults.
	var HISTORY_FORMAT = "convertigo-flow-defaults";
	var DEPENDENCIES_FORMAT = "convertigo-flow-dependencies";
	var memo = {};

	function versionParts(version) {
		return String(version || "").trim().split(/[.\-_+]/).filter(function (part) { return part !== ""; });
	}

	/** Numeric-aware version order: 8.4.10 > 8.4.9; a release sorts after its qualifiers (8.5.0 > 8.5.0-beta). */
	function compareVersions(left, right) {
		var a = versionParts(left);
		var b = versionParts(right);
		for (var i = 0; i < Math.max(a.length, b.length); i++) {
			if (i >= a.length) return /^\d+$/.test(b[i]) ? -1 : 1;
			if (i >= b.length) return /^\d+$/.test(a[i]) ? 1 : -1;
			var na = /^\d+$/.test(a[i]);
			var nb = /^\d+$/.test(b[i]);
			if (na && nb) {
				var diff = Number(a[i]) - Number(b[i]);
				if (diff !== 0) return diff < 0 ? -1 : 1;
			} else if (na !== nb) {
				return na ? 1 : -1;
			} else if (a[i] !== b[i]) {
				return a[i] < b[i] ? -1 : 1;
			}
		}
		return 0;
	}

	function cached(file, env, read) {
		var key = env.canonicalPath(file);
		var stamp = file.isFile() ? String(file.lastModified()) + ":" + String(file.length()) : "absent";
		var entry = memo[key];
		if (entry && entry.stamp === stamp) {
			return entry.value;
		}
		var value = file.isFile() ? read() : null;
		memo[key] = { stamp: stamp, value: value };
		return value;
	}

	function readJson(file, env) {
		return cached(file, env, function () {
			try {
				return JSON.parse(String(env.FileUtils.readFileToString(file, "UTF-8")));
			} catch (e) {
				return null;
			}
		});
	}

	/** Version of a Convertigo project (the version property of its project bean). */
	function projectVersion(projectRoot, env) {
		if (!projectRoot) return "";
		var descriptor = new env.File(projectRoot, "c8oProject.yaml");
		return cached(descriptor, env, function () {
			var match = /^ {2}version:\s*(\S+)\s*$/m.exec(String(env.FileUtils.readFileToString(descriptor, "UTF-8")));
			return match ? match[1].replace(/^["']|["']$/g, "") : "";
		}) || "";
	}

	function projectRootOfFile(path, env) {
		for (var dir = path ? new env.File(String(path)).getParentFile() : null; dir; dir = dir.getParentFile()) {
			if (String(dir.getName()) === env.sourcePaths.root) {
				return dir.getParentFile();
			}
		}
		return null;
	}

	function companionFile(path, env) {
		var text = String(path || "");
		var companion = text.replace(/\.block\.js$/, ".block.defaults.json")
			.replace(/\.flow\.svelte$/, ".flow.defaults.json");
		return companion === text ? null : new env.File(companion);
	}

	/** Defaults that applied at a definer version, for the properties whose default changed since. */
	function defaultsAt(companion, version, env) {
		var history = companion ? readJson(companion, env) : null;
		if (!history || history.format !== HISTORY_FORMAT || !(history.history instanceof Array) || !version) {
			return null;
		}
		var entries = history.history.filter(function (entry) {
			return entry && entry.until && entry.props && typeof entry.props === "object";
		}).sort(function (left, right) {
			return compareVersions(left.until, right.until);
		});
		for (var i = 0; i < entries.length; i++) {
			if (compareVersions(entries[i].until, version) >= 0) {
				return entries[i].props;
			}
		}
		return null;
	}

	function dependenciesFile(projectRoot, env) {
		return new env.File(projectRoot, env.sourcePaths.path("dependencies.json"));
	}

	function recordedVersions(projectRoot, env) {
		var recorded = projectRoot ? readJson(dependenciesFile(projectRoot, env), env) : null;
		return recorded && recorded.format === DEPENDENCIES_FORMAT && recorded.projects && typeof recorded.projects === "object"
			? recorded.projects : {};
	}

	/**
	 * Historical defaults applying to a definition used by the current project, or null
	 * when its current defaults apply (own definition, no history, no recorded version).
	 */
	function effectiveDefaults(definitionPath, definerName, env) {
		var current = env.projectDir && env.projectDir();
		var definerRoot = projectRootOfFile(definitionPath, env);
		if (!current || !definerRoot || env.canonicalPath(definerRoot) === env.canonicalPath(current)) {
			return null;
		}
		var companion = companionFile(definitionPath, env);
		if (!companion || !companion.isFile()) {
			return null;
		}
		var recorded = recordedVersions(current, env)[definerName];
		return recorded ? defaultsAt(companion, recorded, env) : null;
	}

	/** Historical defaults of the blocks of a catalog, by block name (non-empty entries only). */
	function blocksDefaultsHistory(blocks, env) {
		var history = {};
		Object.keys(blocks || {}).forEach(function (name) {
			var block = blocks[name];
			var props = block && block.__flowFile ? effectiveDefaults(block.__flowFile, String(block.__flowProvider || ""), env) : null;
			if (props && Object.keys(props).length) {
				history[name] = props;
			}
		});
		return history;
	}

	function collectHistoryFiles(dir, out, env) {
		var files = dir && dir.isDirectory() ? dir.listFiles() : null;
		if (!files) return out;
		env.Arrays.asList(files).toArray().forEach(function (file) {
			var name = String(file.getName());
			if (file.isDirectory()) {
				if (name !== "node_modules" && name !== "icons" && name.charAt(0) !== ".") collectHistoryFiles(file, out, env);
			} else if (/\.defaults\.json$/.test(name)) {
				out.push(file);
			}
		});
		return out;
	}

	/** Whether a default valid at version `from` of a definer changed before version `to`. */
	function defaultsChangedBetween(definerRoot, from, to, env) {
		return collectHistoryFiles(new env.File(definerRoot, env.sourcePaths.root), [], env).some(function (file) {
			var history = readJson(file, env);
			return history && history.format === HISTORY_FORMAT && history.history instanceof Array
				&& history.history.some(function (entry) {
					return entry && entry.until && compareVersions(entry.until, from) >= 0 && compareVersions(entry.until, to) < 0;
				});
		});
	}

	/**
	 * _flow/dependencies.json of the current project: the version of each definer project it
	 * uses (lib_flow_engine and the referenced Flow projects). A recorded version moves to the
	 * current one unless a default changed in between: the sources were written against the
	 * recorded version and keep that meaning until they are migrated.
	 */
	function dependenciesRequest(env) {
		var current = env.projectDir && env.projectDir();
		if (!current) {
			env.raise("PROJECT_RESOURCES_UNAVAILABLE", "Project Flow resources are unavailable.");
		}
		var recorded = recordedVersions(current, env);
		var roots = [env.engineDir().getParentFile()].concat(env.flowReferenceRoots());
		var projects = {};
		var warnings = [];
		roots.forEach(function (root) {
			if (!root || env.canonicalPath(root) === env.canonicalPath(current)) return;
			var name = env.projectNameForRoot(root);
			var version = projectVersion(root, env);
			if (!name || !version || projects[name]) return;
			var previous = recorded[name];
			if (previous && compareVersions(previous, version) !== 0 && defaultsChangedBetween(root, previous, version, env)) {
				projects[name] = previous;
				warnings.push({
					code: "FLOW_DEFAULTS_MIGRATION_REQUIRED",
					project: name,
					recorded: previous,
					current: version,
					message: "Defaults of " + name + " changed between " + previous + " and " + version
						+ ": the sources keep the " + previous + " defaults until they are migrated."
				});
			} else {
				projects[name] = version;
			}
		});
		var sorted = {};
		Object.keys(projects).sort().forEach(function (name) { sorted[name] = projects[name]; });
		var source = JSON.stringify({ format: DEPENDENCIES_FORMAT, projects: sorted }, null, 2) + "\n";
		var file = dependenciesFile(current, env);
		var existing = file.isFile() ? String(env.FileUtils.readFileToString(file, "UTF-8")) : "";
		return {
			ok: true,
			path: String(file.getAbsolutePath()),
			source: source,
			changed: existing !== source,
			warnings: warnings
		};
	}

	return {
		compareVersions: compareVersions,
		projectVersion: projectVersion,
		defaultsAt: defaultsAt,
		effectiveDefaults: effectiveDefaults,
		blocksDefaultsHistory: blocksDefaultsHistory,
		dependenciesRequest: dependenciesRequest
	};
}())
