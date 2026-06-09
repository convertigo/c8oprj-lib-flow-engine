(function () {
	function projectFlowFile(name, env) {
		var dir = env.projectFlowsDir();
		if (!dir) {
			env.raise("PROJECT_FLOWS_UNAVAILABLE", "Project flows are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new env.File(dir, env.flowFileName(name));
	}

	function projectFlowCodeFile(name, env) {
		var dir = env.projectFlowsDir();
		if (!dir) {
			env.raise("PROJECT_FLOWS_UNAVAILABLE", "Project flows are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new env.File(dir, env.flowCodeFileName(name));
	}

	function projectFlowDraftCodeFile(name, env) {
		var dir = env.projectFlowDraftsDir();
		if (!dir) {
			env.raise("PROJECT_FLOW_DRAFTS_UNAVAILABLE", "Project Flow drafts are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new env.File(dir, env.flowCodeFileName(name));
	}

	function flowNameFromFile(file) {
		var filename = String(file && file.getName ? file.getName() : file || "");
		if (filename.endsWith(".flow.js")) {
			return filename.substring(0, filename.length - ".flow.js".length);
		}
		if (filename.endsWith(".flow.yaml")) {
			return filename.substring(0, filename.length - ".flow.yaml".length);
		}
		return "";
	}

	function projectFlowStorage(name, env) {
		return {
			name: String(name || ""),
			codeFile: projectFlowCodeFile(name, env),
			yamlFile: projectFlowFile(name, env)
		};
	}

	function projectFragmentFile(name, env) {
		var dir = env.projectFragmentsDir();
		if (!dir) {
			env.raise("PROJECT_FRAGMENTS_UNAVAILABLE", "Project Flow fragments are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new env.File(dir, env.fragmentFileName(name));
	}

	function fragmentCandidates(name, env) {
		var out = [];
		var dir = env.projectFragmentsDir();
		if (dir) {
			out.push(new env.File(dir, env.fragmentFileName(name)));
		}
		out.push(new env.File(new env.File(env.engineDir(), "fragments"), env.fragmentFileName(name)));
		return out;
	}

	function fragmentFile(name, env) {
		var candidates = fragmentCandidates(name, env);
		for (var i = 0; i < candidates.length; i++) {
			if (candidates[i].isFile()) {
				return candidates[i];
			}
		}
		env.raise("UNKNOWN_FRAGMENT", "Unknown Flow fragment: " + name,
			null, "Create libs/flow/fragments/" + env.fragmentFileName(name) + " in the current project.");
	}

	function readFragment(name, env) {
		var file = fragmentFile(name, env);
		var source = String(env.FileUtils.readFileToString(file, "UTF-8"));
		return {
			name: String(name),
			file: String(file.getAbsolutePath()),
			source: source,
			definition: env.parseYamlSource(source, "version: 1\nnodes: []\n")
		};
	}

	function sortedFiles(dir, env) {
		var listed = dir && dir.listFiles();
		if (!listed) {
			return [];
		}
		var files = env.Arrays.asList(listed).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		return files;
	}

	function listProjectFlows(env) {
		var dir = env.projectFlowsDir();
		if (!dir || !dir.isDirectory()) {
			return { flows: [] };
		}
		var byName = {};
		sortedFiles(dir, env).filter(function (file) {
			return file.isFile() && (String(file.getName()).endsWith(".flow.js") || String(file.getName()).endsWith(".flow.yaml"));
		}).forEach(function (file) {
			var name = flowNameFromFile(file);
			if (!name) {
				return;
			}
			var codeFile = String(file.getName()).endsWith(".flow.js") ? file : new env.File(file.getParentFile(), env.flowCodeFileName(name));
			var yamlFile = String(file.getName()).endsWith(".flow.yaml") ? file : new env.File(file.getParentFile(), env.flowFileName(name));
			var previous = byName[name];
			if (previous && previous.format === "flowscript" && !String(file.getName()).endsWith(".flow.js")) {
				return;
			}
			var canonical = codeFile.isFile() ? codeFile : yamlFile;
			byName[name] = {
				name: name,
				format: codeFile.isFile() ? "flowscript" : "yaml",
				file: String(canonical.getAbsolutePath()),
				sourceFile: yamlFile.isFile() ? String(yamlFile.getAbsolutePath()) : "",
				codeFile: codeFile.isFile() ? String(codeFile.getAbsolutePath()) : "",
				size: Number(canonical.length()),
				sourceSize: yamlFile.isFile() ? Number(yamlFile.length()) : 0,
				codeSize: codeFile.isFile() ? Number(codeFile.length()) : 0,
				lastModified: Number(canonical.lastModified())
			};
		});
		return {
			flows: Object.keys(byName).sort().map(function (name) {
				return byName[name];
			})
		};
	}

	function listProjectFragments(env) {
		var dir = env.projectFragmentsDir();
		if (!dir || !dir.isDirectory()) {
			return { fragments: [] };
		}
		return {
			fragments: sortedFiles(dir, env).filter(function (file) {
				return file.isFile() && String(file.getName()).endsWith(".fragment.yaml");
			}).map(function (file) {
				var filename = String(file.getName());
				return {
					name: filename.substring(0, filename.length - ".fragment.yaml".length),
					file: String(file.getAbsolutePath()),
					size: Number(file.length()),
					lastModified: Number(file.lastModified())
				};
			})
		};
	}

	return {
		projectFlowFile: projectFlowFile,
		projectFlowCodeFile: projectFlowCodeFile,
		projectFlowDraftCodeFile: projectFlowDraftCodeFile,
		flowNameFromFile: flowNameFromFile,
		projectFlowStorage: projectFlowStorage,
		projectFragmentFile: projectFragmentFile,
		fragmentCandidates: fragmentCandidates,
		fragmentFile: fragmentFile,
		readFragment: readFragment,
		listProjectFlows: listProjectFlows,
		listProjectFragments: listProjectFragments
	};
}())
