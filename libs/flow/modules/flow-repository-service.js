(function () {
	function create(env) {
		var File = env.File;
		var Arrays = env.Arrays;
		var FileUtils = env.FileUtils;
		var normalizeFlowScriptFunctionSyntax = env.normalizeFlowScriptFunctionSyntax;
		var parseFlowScript = env.parseFlowScript;
		var validateFlowScriptDefinition = env.validateFlowScriptDefinition;
		var stripFlowScriptMetadata = env.stripFlowScriptMetadata;
		var sourceFromDefinition = env.sourceFromDefinition;
		var projectFlowStorage = env.projectFlowStorage;
		var parseSource = env.parseSource;
		var raise = env.raise;
		var sha256Hex = env.sha256Hex;
		var flowNameFromFile = env.flowNameFromFile;
		var isSampleFlowName = env.isSampleFlowName;
		var loadBlocks = env.loadBlocks;
		var listProjectFlows = env.listProjectFlows;
		var projectDir = env.projectDir;
		var currentProjectName = env.currentProjectName;
		var canonicalPath = env.canonicalPath;
		var flowProjectRootFromFlowDir = env.flowProjectRootFromFlowDir;
		var engineDir = env.engineDir;
		var flowProviderName = env.flowProviderName;
		var flowCodeFileName = env.flowCodeFileName;

		function sourceFromFlowScript(blocks, name, code) {
			code = normalizeFlowScriptFunctionSyntax(code);
			var definition = parseFlowScript(blocks, code);
			var diagnostics = validateFlowScriptDefinition(blocks, definition);
			var errors = diagnostics.filter(function (diagnostic) {
				return diagnostic.severity === "error";
			});
			if (errors.length) {
				var error = new Error("Canonical FlowScript is invalid for Flow " + name + ".");
				error.code = "FLOWSCRIPT_CANONICAL_INVALID";
				error.details = diagnostics;
				error.hint = "Fix the .flow.js file or regenerate it from a valid Flow model.";
				throw error;
			}
			var clean = stripFlowScriptMetadata(definition);
			return {
				source: sourceFromDefinition(clean),
				definition: clean,
				diagnostics: diagnostics
			};
		}

		function getProjectFlow(name, blocks) {
			var storage = projectFlowStorage(name);
			if (storage.codeFile.isFile()) {
				var code = String(FileUtils.readFileToString(storage.codeFile, "UTF-8"));
				var compiled = sourceFromFlowScript(blocks || loadBlocks(), name, code);
				return {
					name: String(name),
					format: "flowscript",
					file: String(storage.codeFile.getAbsolutePath()),
					sourceFile: "",
					codeFile: String(storage.codeFile.getAbsolutePath()),
					code: code,
					revision: sha256Hex(code),
					source: compiled.source,
					definition: compiled.definition,
					diagnostics: compiled.diagnostics
				};
			}
			raise("UNKNOWN_FLOW", "Unknown Flow sidecar: " + name,
				null, "Flow sidecars are canonical FlowScript files: libs/flows/" + flowCodeFileName(name) + ".");
		}

		function listFlowsFromRoot(root, projectName, origin, samplesOnly) {
			root = root ? new File(root) : null;
			var dir = root ? new File(root, "libs/flows") : null;
			if (!dir || !dir.isDirectory()) {
				return [];
			}
			var listed = dir.listFiles();
			if (!listed) {
				return [];
			}
			var files = Arrays.asList(listed).toArray();
			files.sort(function (a, b) {
				return String(a.getName()).localeCompare(String(b.getName()));
			});
			var byName = {};
			files.filter(function (file) {
				return file.isFile() && String(file.getName()).endsWith(".flow.js");
			}).forEach(function (file) {
				var name = flowNameFromFile(file);
				if (!name || (samplesOnly === true && !isSampleFlowName(name))) {
					return;
				}
				byName[name] = {
					name: name,
					file: file,
					format: "flowscript"
				};
			});
			return Object.keys(byName).sort().map(function (name) {
				var entry = byName[name];
				var file = entry.file;
				var raw = String(FileUtils.readFileToString(file, "UTF-8"));
				var source = sourceFromFlowScript(loadBlocks(), name, raw).source;
				return {
					name: name,
					project: projectName || (root ? String(root.getName()) : ""),
					origin: origin || "project",
					format: entry.format,
					file: String(file.getAbsolutePath()),
					source: source,
					code: entry.format === "flowscript" ? raw : "",
					size: Number(file.length()),
					lastModified: Number(file.lastModified())
				};
			});
		}

		function visibleSearchFlows(request) {
			var flows = [];
			var currentRoot = projectDir();
			var currentProject = currentProjectName(request) || (currentRoot ? String(new File(currentRoot).getName()) : "");
			var blocks = loadBlocks();
			listProjectFlows().flows.forEach(function (flow) {
				var current = getProjectFlow(flow.name, blocks);
				flows.push(Object.assign({}, flow, {
					project: currentProject,
					origin: "project",
					source: current.source,
					code: current.code || ""
				}));
			});
			if (request.includeLibrarySamples === false) {
				return flows;
			}
			var seen = {};
			flows.forEach(function (flow) {
				seen[canonicalPath(new File(flow.file))] = true;
			});
			var engineRoot = flowProjectRootFromFlowDir(engineDir());
			var engineProvider = flowProviderName(engineDir(), "lib_flow_engine");
			listFlowsFromRoot(engineRoot, engineProvider, "core", true).forEach(function (flow) {
				var key = canonicalPath(new File(flow.file));
				if (!seen[key]) {
					seen[key] = true;
					flows.push(flow);
				}
			});
			return flows;
		}

		return {
			sourceFromFlowScript: sourceFromFlowScript,
			getProjectFlow: getProjectFlow,
			listFlowsFromRoot: listFlowsFromRoot,
			visibleSearchFlows: visibleSearchFlows
		};
	}

	return {
		sourceFromFlowScript: function (blocks, name, code, env) {
			return create(env).sourceFromFlowScript(blocks, name, code);
		},
		getProjectFlow: function (name, blocks, env) {
			return create(env).getProjectFlow(name, blocks);
		},
		listFlowsFromRoot: function (root, projectName, origin, samplesOnly, env) {
			return create(env).listFlowsFromRoot(root, projectName, origin, samplesOnly);
		},
		visibleSearchFlows: function (request, env) {
			return create(env).visibleSearchFlows(request);
		}
	};
}())
