(function () {
	function create(env) {
		var File = env.File;
		var FileUtils = env.FileUtils;
		var normalizeTree = env.normalizeTree;
		var parseYamlSource = env.parseYamlSource;
		var raise = env.raise;
		var blockImplementation = env.blockImplementation;
		var blockFlowFileName = env.blockFlowFileName;
		var blockFileName = env.blockFileName;
		var blockHooksFileName = env.blockHooksFileName;
		var blockLocalName = env.blockLocalName;
		var projectBlockDescriptorFile = env.projectBlockDescriptorFile;
		var projectBlockCodeFile = env.projectBlockCodeFile;
		var projectBlocksDir = env.projectBlocksDir;
		var projectDir = env.projectDir;
		var validateGraphBlockDefinition = env.validateGraphBlockDefinition;
		var graphBlockDefinitionForWrite = env.graphBlockDefinitionForWrite;
		var validateBlockFlowImplementationSource = env.validateBlockFlowImplementationSource;
		var flowScriptBlockCodeSource = env.flowScriptBlockCodeSource;
		var sourceFromDefinition = env.sourceFromDefinition;
		var validateBlockImplementationSource = env.validateBlockImplementationSource;
		var enforceRhinoImplementationPolicy = env.enforceRhinoImplementationPolicy;
		var rhinoBlockCodeSource = env.rhinoBlockCodeSource;
		var validateBlockHooksSource = env.validateBlockHooksSource;
		var compileProjectBlockCode = env.compileProjectBlockCode;
		var publicBlockDescriptor = env.publicBlockDescriptor;
		var blockDescriptor = env.blockDescriptor;
		var loadFlowScriptBlockFile = env.loadFlowScriptBlockFile;
		var flowProviderName = env.flowProviderName;
		var getBlockSource = env.getBlockSource;
		var duplicateBlockCodeSource = env.duplicateBlockCodeSource;

		function canonicalBlockDefinition(name, request) {
			request = request || {};
			var hasDefinition = request.descriptorSource !== undefined && request.descriptorSource !== null ||
				request.descriptor !== undefined && request.descriptor !== null ||
				request.definition !== undefined && request.definition !== null;
			var definition;
			if (request.descriptorSource !== undefined && request.descriptorSource !== null) {
				definition = parseYamlSource(request.descriptorSource, "version: 1\n");
			} else if (request.descriptor !== undefined && request.descriptor !== null) {
				definition = normalizeTree(request.descriptor);
			} else if (request.definition !== undefined && request.definition !== null) {
				definition = normalizeTree(request.definition);
			} else {
				definition = {
					version: 1,
					name: String(name),
					implementation: { runtime: String(request.runtime || "flow") }
				};
			}
			definition.name = String(name);
			if (definition.version === undefined) {
				definition.version = 1;
			}
			var implementation = blockImplementation(definition);
			if (request.runtime && !hasDefinition) {
				implementation.runtime = String(request.runtime);
			}
			if (!implementation.file) {
				implementation.file = implementation.runtime === "flow" ? blockFlowFileName(name) : blockFileName(name);
			}
			definition.implementation = implementation;
			return validateGraphBlockDefinition(name, definition);
		}

		function blockCodeMetaFromDefinition(definition) {
			var meta = graphBlockDefinitionForWrite(definition || {});
			var implementation = blockImplementation(meta);
			meta.runtime = String(implementation.runtime || "flow");
			meta.properties = meta.properties || meta.props || {};
			delete meta.props;
			delete meta.implementation;
			delete meta.name;
			return meta;
		}

		function canonicalBlockCodeFromDefinitionSource(blocks, name, definition, implementationSource, request) {
			var implementation = blockImplementation(definition);
			var meta = blockCodeMetaFromDefinition(definition);
			if (implementation.runtime === "flow") {
				var flowDefinition = validateBlockFlowImplementationSource(name, implementationSource);
				return flowScriptBlockCodeSource(name, sourceFromDefinition(flowDefinition), meta);
			}
			validateBlockImplementationSource(name, implementationSource);
			enforceRhinoImplementationPolicy(name, implementationSource);
			return rhinoBlockCodeSource(name, implementationSource, meta);
		}

		function implementationTargetFile(descriptorFile, definition) {
			var implementation = blockImplementation(definition);
			var defaultFile = implementation.runtime === "flow" ? blockFlowFileName(definition.name) : blockFileName(definition.name);
			var file = new File(String(implementation.file || defaultFile));
			if (!file.isAbsolute()) {
				file = new File(descriptorFile.getParentFile(), String(implementation.file || defaultFile));
			}
			return file;
		}

		function hooksTargetFile(descriptorFile, definition) {
			var hooks = definition && definition.hooks;
			if (!hooks) {
				return null;
			}
			if (typeof hooks === "string") {
				hooks = { file: hooks };
				definition.hooks = hooks;
			}
			hooks = normalizeTree(hooks);
			if (!hooks.file) {
				return null;
			}
			var file = new File(String(hooks.file));
			if (!file.isAbsolute()) {
				file = new File(descriptorFile.getParentFile(), String(hooks.file));
			}
			return file;
		}

		function deleteIfFile(file) {
			try {
				return file && file.isFile() && file["delete"]();
			} catch (_ignoreDelete) {
				return false;
			}
		}

		function cleanupProjectBlockYamlFallback(name, descriptor) {
			var removed = [];
			var descriptorFile = projectBlockDescriptorFile(name);
			if (deleteIfFile(descriptorFile)) {
				removed.push(String(descriptorFile.getAbsolutePath()));
			}
			var implementation = blockImplementation(descriptor || {});
			var implementationFile = implementationTargetFile(descriptorFile, Object.assign({
				name: blockLocalName(name) || name,
				implementation: implementation.file ? implementation : { runtime: "flow", file: blockFlowFileName(name) }
			}, descriptor || {}));
			if (deleteIfFile(implementationFile)) {
				removed.push(String(implementationFile.getAbsolutePath()));
			}
			return removed;
		}

		function setProjectBlockCode(blocks, name, request) {
			request = request || {};
			name = String(name || request.name || "").trim();
			if (!name) {
				raise("MISSING_BLOCK_NAME", "block.code.set requires name.");
			}
			var code = request.code !== undefined && request.code !== null ? String(request.code) : "";
			if (code.trim() === "") {
				raise("MISSING_BLOCK_CODE", "block.code.set requires .block.js code.");
			}
			var compiled = compileProjectBlockCode(blocks, name, code, request);
			if (request.dry === true || request.dryRun === true || String(request.dry || "") === "true" || String(request.dryRun || "") === "true") {
				return {
					ok: true,
					name: name,
					dry: true,
					format: compiled.runtime === "rhino" ? "blockjs" : "flowscript",
					canonical: true,
					revision: compiled.revision,
					descriptor: publicBlockDescriptor(compiled.descriptor),
					code: compiled.code,
					implementationSource: compiled.source,
					warnings: (compiled.warnings || (compiled.diagnostics || []).filter(function (diagnostic) {
						return diagnostic.severity === "warning";
					}))
				};
			}
			var current = blocks[name];
			if (current && current.__flowOrigin !== "project") {
				raise("DUPLICATE_BLOCK", "Cannot override non-project Flow block: " + name,
					null, "Choose a project-specific name instead.");
			}
			var codeFile = projectBlockCodeFile(name);
			if (codeFile.isFile() && request.overwrite !== true && String(request.overwrite || "") !== "true" &&
					(!current || current.__flowFormat !== "flowscript-block")) {
				raise("BLOCK_ALREADY_EXISTS", "Project FlowScript block already exists: " + name,
					null, "Pass overwrite=true to replace it explicitly.");
			}
			codeFile.getParentFile().mkdirs();
			FileUtils.writeStringToFile(codeFile, compiled.code, "UTF-8");
			var removed = cleanupProjectBlockYamlFallback(name, compiled.descriptor);
			if (blocks[name]) {
				delete blocks[name];
			}
			var loaded = publicBlockDescriptor(blockDescriptor(loadFlowScriptBlockFile(blocks, codeFile, "project",
				flowProviderName(new File(projectDir(), "libs/flow"), "project"), projectBlocksDir())));
			return {
				ok: true,
				name: name,
				dry: false,
				format: compiled.runtime === "rhino" ? "blockjs" : "flowscript",
				canonical: true,
				file: String(codeFile.getAbsolutePath()),
				codeFile: String(codeFile.getAbsolutePath()),
				revision: compiled.revision,
				removedFallbacks: removed,
				warnings: (compiled.warnings || (compiled.diagnostics || []).filter(function (diagnostic) {
					return diagnostic.severity === "warning";
				})),
				block: loaded
			};
		}

		function createProjectBlock(blocks, name, request, overwrite) {
			if (typeof request !== "object" || request === null) {
				raise("INVALID_BLOCK_REQUEST", "Block creation expects a canonical descriptor request object.",
					null, "Pass code to flow-block-code-set, or descriptor/implementationSource for compatibility.");
			}
			overwrite = overwrite === true || request.overwrite === true;
			var descriptorFile = projectBlockDescriptorFile(name);
			var codeFile = projectBlockCodeFile(name);
			var block = blocks[String(name || "")];
			if (block && block.__flowOrigin !== "project") {
				raise("DUPLICATE_BLOCK", "Cannot override non-project Flow block: " + name,
					null, "Choose a project-specific name instead.");
			}
			if ((codeFile.isFile() || descriptorFile.isFile()) && overwrite !== true) {
				raise("BLOCK_ALREADY_EXISTS", "Project block already exists: " + name,
					null, "Pass overwrite=true to replace it explicitly.");
			}
			var definition = canonicalBlockDefinition(name, request);
			var implementation = blockImplementation(definition);
			var hooksFile = hooksTargetFile(codeFile, definition);
			var implementationSource = request.implementationSource;
			var hooksSource = request.hooksSource;
			if (implementation.runtime === "flow" && (implementationSource === undefined || implementationSource === null)) {
				implementationSource = "version: 1\nnodes: []\n";
			}
			if (implementationSource === undefined || implementationSource === null || String(implementationSource).trim() === "") {
				raise("MISSING_BLOCK_IMPLEMENTATION", "Block \"" + name + "\" needs implementationSource.",
					null, "Pass Flow YAML for runtime=flow, Rhino ES6 source for runtime=rhino, or use flow-block-code-set with .block.js code.");
			}
			if (hooksFile && hooksSource !== undefined && hooksSource !== null && hooksFile.isFile() && overwrite !== true) {
				raise("BLOCK_ALREADY_EXISTS", "Block hooks already exists: " + hooksFile.getAbsolutePath(),
					null, "Pass overwrite=true to replace it explicitly.");
			}
			if (hooksFile && (hooksSource === undefined || hooksSource === null) && !hooksFile.isFile()) {
				raise("MISSING_BLOCK_HOOKS", "Block \"" + name + "\" declares hooks.file but no hooksSource was provided.",
					null, "Pass hooksSource or remove hooks.file from the descriptor.");
			}
			var code = canonicalBlockCodeFromDefinitionSource(blocks, name, definition, String(implementationSource), request);
			if (hooksFile && hooksSource !== undefined && hooksSource !== null) {
				validateBlockHooksSource(name, hooksSource);
				hooksFile.getParentFile().mkdirs();
				FileUtils.writeStringToFile(hooksFile, String(hooksSource), "UTF-8");
			}
			return setProjectBlockCode(blocks, name, Object.assign({}, request, {
				code: code,
				overwrite: overwrite
			})).block;
		}

		function editProjectBlock(blocks, name, request) {
			if (typeof request !== "object" || request === null) {
				raise("INVALID_BLOCK_REQUEST", "Block edit expects a canonical descriptor request object.",
					null, "Pass code to flow-block-code-set, or descriptor/implementationSource for compatibility.");
			}
			var block = blocks[String(name || "")];
			if (!block || block.__flowOrigin !== "project") {
				raise("BLOCK_NOT_EDITABLE", "Only project-local Flow blocks can be edited: " + name,
					null, "Duplicate core/shared blocks first, then edit the project-local copy.");
			}
			if (request.code !== undefined && request.code !== null) {
				return setProjectBlockCode(blocks, name, request).block;
			}
			var sourceInfo = getBlockSource(blocks, name, { detail: "full", includeSources: true });
			var hasDescriptor = request.descriptorSource !== undefined || request.descriptor !== undefined || request.definition !== undefined;
			var hasImplementation = request.implementationSource !== undefined;
			return createProjectBlock(blocks, name, {
				descriptorSource: request.descriptorSource,
				descriptor: hasDescriptor && request.descriptorSource === undefined ? request.descriptor || request.definition : sourceInfo.descriptor,
				implementationSource: hasImplementation ? request.implementationSource : sourceInfo.implementationSource,
				hooksSource: request.hooksSource,
				overwrite: true
			}, true);
		}

		function duplicateProjectBlock(blocks, fromName, toName, overwrite) {
			fromName = String(fromName || "");
			toName = String(toName || "");
			if (!fromName || !toName) {
				raise("MISSING_BLOCK_NAME", "Block duplication requires fromName and toName.");
			}
			if (fromName === toName) {
				raise("INVALID_BLOCK_NAME", "Block duplication target must differ from source: " + toName);
			}
			var sourceInfo = getBlockSource(blocks, fromName, { detail: "full", includeSources: true });
			var hooksSource = sourceInfo.hooksSource;
			if (sourceInfo.code) {
				var duplicatedCode = duplicateBlockCodeSource(sourceInfo.code, fromName, toName, hooksSource !== undefined && hooksSource !== null);
				if (hooksSource !== undefined && hooksSource !== null) {
					var hooksFile = hooksTargetFile(projectBlockCodeFile(toName), {
						name: blockLocalName(toName) || toName,
						hooks: { file: blockHooksFileName(toName) }
					});
					hooksFile.getParentFile().mkdirs();
					FileUtils.writeStringToFile(hooksFile, String(hooksSource), "UTF-8");
				}
				return setProjectBlockCode(blocks, toName, {
					code: duplicatedCode,
					overwrite: overwrite === true
				}).block;
			}
			var definition = normalizeTree(sourceInfo.descriptor || {});
			definition.name = toName;
			return createProjectBlock(blocks, toName, {
				descriptor: definition,
				implementationSource: sourceInfo.implementationSource,
				hooksSource: hooksSource,
				overwrite: overwrite === true
			}, overwrite);
		}

		return {
			canonicalBlockDefinition: canonicalBlockDefinition,
			blockCodeMetaFromDefinition: blockCodeMetaFromDefinition,
			canonicalBlockCodeFromDefinitionSource: canonicalBlockCodeFromDefinitionSource,
			implementationTargetFile: implementationTargetFile,
			hooksTargetFile: hooksTargetFile,
			cleanupProjectBlockYamlFallback: cleanupProjectBlockYamlFallback,
			setProjectBlockCode: setProjectBlockCode,
			createProjectBlock: createProjectBlock,
			editProjectBlock: editProjectBlock,
			duplicateProjectBlock: duplicateProjectBlock
		};
	}

	return {
		canonicalBlockDefinition: function (name, request, env) {
			return create(env).canonicalBlockDefinition(name, request);
		},
		blockCodeMetaFromDefinition: function (definition, env) {
			return create(env).blockCodeMetaFromDefinition(definition);
		},
		canonicalBlockCodeFromDefinitionSource: function (blocks, name, definition, implementationSource, request, env) {
			return create(env).canonicalBlockCodeFromDefinitionSource(blocks, name, definition, implementationSource, request);
		},
		implementationTargetFile: function (descriptorFile, definition, env) {
			return create(env).implementationTargetFile(descriptorFile, definition);
		},
		hooksTargetFile: function (descriptorFile, definition, env) {
			return create(env).hooksTargetFile(descriptorFile, definition);
		},
		cleanupProjectBlockYamlFallback: function (name, descriptor, env) {
			return create(env).cleanupProjectBlockYamlFallback(name, descriptor);
		},
		setProjectBlockCode: function (blocks, name, request, env) {
			return create(env).setProjectBlockCode(blocks, name, request);
		},
		createProjectBlock: function (blocks, name, request, overwrite, env) {
			return create(env).createProjectBlock(blocks, name, request, overwrite);
		},
		editProjectBlock: function (blocks, name, request, env) {
			return create(env).editProjectBlock(blocks, name, request);
		},
		duplicateProjectBlock: function (blocks, fromName, toName, overwrite, env) {
			return create(env).duplicateProjectBlock(blocks, fromName, toName, overwrite);
		}
	};
}())
