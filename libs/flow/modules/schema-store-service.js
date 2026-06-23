(function () {
	function schemaNodeKey(node, outPath, env) {
		return env.safeFilePart(env.nodePath(node) || outPath || env.blockName(node));
	}

	function outputSchemaFile(request, definition, node, property, outPath, env) {
		var dir = env.projectSchemasDir();
		var flowName = env.flowNameFor(request, definition);
		var nodeKey = schemaNodeKey(node, outPath, env);
		if (!dir || !flowName || !nodeKey) {
			return null;
		}
		var flowDir = new env.File(dir, flowName);
		return new env.File(flowDir, nodeKey + "." + env.safeFilePart(property || "out") + ".schema.json");
	}

	function resultSchemaFile(request, definition, env) {
		var dir = env.projectSchemasDir();
		var flowName = env.flowNameFor(request, definition);
		if (!dir || !flowName) {
			return null;
		}
		return new env.File(new env.File(dir, flowName), "result.out.schema.json");
	}

	function readOutputSchema(request, definition, node, property, outPath, env) {
		var file = outputSchemaFile(request, definition, node, property, outPath, env);
		if (!file || !file.isFile()) {
			return null;
		}
		return JSON.parse(String(env.FileUtils.readFileToString(file, "UTF-8")));
	}

	function readResultSchema(request, definition, env) {
		var file = resultSchemaFile(request, definition, env);
		if (!file || !file.isFile()) {
			return null;
		}
		return JSON.parse(String(env.FileUtils.readFileToString(file, "UTF-8")));
	}

	function learnOutputSchema(request, definition, node, property, outPath, value, env) {
		var file = outputSchemaFile(request, definition, node, property, outPath, env);
		if (!file || file.isFile()) {
			return { learned: false, file: file ? String(file.getAbsolutePath()) : "" };
		}
		var schema = env.inferSchema(value);
		file.getParentFile().mkdirs();
		env.FileUtils.writeStringToFile(file, JSON.stringify(schema, null, 2), "UTF-8");
		return {
			learned: true,
			file: String(file.getAbsolutePath()),
			schema: schema
		};
	}

	function clearConvertigoSchemaCache(request, env) {
		try {
			var projectName = env.currentProjectName(request);
			if (projectName) {
				Packages.com.twinsoft.convertigo.engine.Engine.theApp.schemaManager.clearCache(projectName);
			}
		} catch (e) {
		}
	}

	function declaredOutputSchema(definition) {
		var meta = definition && (definition.flow || definition._flow) || {};
		var schema = definition && (definition.output || definition.outputs) || meta.output || meta.outputs;
		return schema && Object.keys(schema).length > 0 ? schema : null;
	}

	function declaredPropertyOutputSchema(catalog, property, env) {
		if (!catalog || !property) {
			return null;
		}
		var outputs = catalog.outputs || catalog.output || {};
		if (!outputs || typeof outputs !== "object") {
			return null;
		}
		var schema = outputs[property] || (property === "out" ? outputs : null);
		return schema && typeof schema === "object" ? env.normalizeTree(schema) : null;
	}

	function summary(schema, env) {
		schema = env.normalizeTree(schema);
		return {
			type: env.schemaSimpleType(schema),
			paths: env.schemaPaths(schema, "").slice(0, 20),
			arrayPaths: env.schemaArrayPaths(schema, "").slice(0, 20),
			leafPaths: env.schemaLeafEntries(schema, "").slice(0, 20)
		};
	}

	function learnResultSchema(request, definition, value, env) {
		if (declaredOutputSchema(definition)) {
			return { learned: false, declared: true };
		}
		var file = resultSchemaFile(request, definition, env);
		if (!file || file.isFile()) {
			return { learned: false, file: file ? String(file.getAbsolutePath()) : "" };
		}
		var schema = env.inferSchema(value);
		file.getParentFile().mkdirs();
		env.FileUtils.writeStringToFile(file, JSON.stringify(schema, null, 2), "UTF-8");
		clearConvertigoSchemaCache(request, env);
		return {
			learned: true,
			file: String(file.getAbsolutePath()),
			schema: schema
		};
	}

	function reset(request, env) {
		request = request || {};
		var blocks = env.loadBlocks();
		var flowName = env.flowNameFor(request, {});
		var hasInlineSource = request.definition !== undefined && request.definition !== null ||
			request.flowSource !== undefined && request.flowSource !== null && String(request.flowSource).trim() !== "";
		var definition = {};
		try {
			definition = env.parseSource(env.sourceForFlowRequest(request, blocks));
			if (!flowName) {
				flowName = env.flowNameFor(request, definition);
			}
		} catch (e) {
			if (hasInlineSource || !flowName) {
				throw e;
			}
			definition = {
				name: flowName
			};
		}
		var dir = env.projectSchemasDir();
		if (!dir) {
			env.raise("FLOW_SCHEMA_UNAVAILABLE", "Flow schema storage is unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		if (!flowName) {
			env.raise("FLOW_SCHEMA_FLOW_REQUIRED", "Flow schema reset requires a flow name.");
		}
		var nodeId = request.node || request.nodeId || request.id || "";
		if (nodeId) {
			var file = outputSchemaFile({
				flowName: flowName
			}, definition, {
				id: nodeId,
				block: request.block || ""
			}, request.property || "out", request.out || request.path || "", env);
			var deleted = file && file.isFile() ? file["delete"]() : false;
			return {
				ok: true,
				deleted: deleted,
				file: file ? String(file.getAbsolutePath()) : ""
			};
		}
		var flowDir = new env.File(dir, flowName);
		var existed = flowDir.isDirectory();
		if (existed) {
			env.FileUtils.deleteDirectory(flowDir);
		}
		return {
			ok: true,
			deleted: existed,
			dir: String(flowDir.getAbsolutePath())
		};
	}

	return {
		schemaNodeKey: schemaNodeKey,
		outputSchemaFile: outputSchemaFile,
		resultSchemaFile: resultSchemaFile,
		readOutputSchema: readOutputSchema,
		readResultSchema: readResultSchema,
		learnOutputSchema: learnOutputSchema,
		clearConvertigoSchemaCache: clearConvertigoSchemaCache,
		declaredOutputSchema: declaredOutputSchema,
		declaredPropertyOutputSchema: declaredPropertyOutputSchema,
		summary: summary,
		learnResultSchema: learnResultSchema,
		reset: reset
	};
}())
