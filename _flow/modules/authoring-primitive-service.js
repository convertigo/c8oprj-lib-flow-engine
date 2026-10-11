(function () {
	// The protected authoring primitives a Flow may call (config.mutate, schema.adopt). The platform checks the real
	// principal of the root request, whatever the accessibility of the Flows on the way: an administrator over HTTP
	// (POST with the session XSRF token), an authenticated MCP call (marked by the MCP), the Studio, or a server-side
	// origin without HTTP caller. Anyone else gets a plain refusal, dry runs included.
	var PRINCIPAL_ATTRIBUTE = "com.convertigo.flow.principal";
	// keys holding a secret: password, clientSecret, accessToken, apiKey... (not secretFile, a path, nor tokenUrl)
	var SECRET_KEY = /(password|passwd|secret|token|apikey|api_key|privatekey|private_key)$/i;
	var SECRET_REFERENCE = /^\$\{[^}=]+\.secret(=[^}]*)?\}$/;
	var NAME = /^[A-Za-z_$][\w$-]*$/;

	function forbidden(env, reason) {
		env.log("(authoring) refused: " + reason);
		env.raise("AUTHORING_FORBIDDEN", "This operation is not allowed.");
	}

	// @return { kind: studio | internal | mcp | admin, user }, or raises AUTHORING_FORBIDDEN
	function principal(convertigoContext, env) {
		if (env.studioMode()) {
			return { kind: "studio", user: "studio" };
		}
		var request = convertigoContext ? convertigoContext.httpServletRequest : null;
		if (request === null || request === undefined || env.isInternalRequest(request)) {
			return { kind: "internal", user: "internal" };
		}
		var mcp = request.getAttribute(PRINCIPAL_ATTRIBUTE);
		if (mcp !== null && mcp !== undefined && String(mcp).indexOf("mcp:") === 0) {
			return { kind: "mcp", user: String(mcp).substring(4) };
		}
		var session = request.getSession(false);
		if (session === null || session === undefined || !env.isWebAdmin(session)) {
			forbidden(env, "no administrator session nor authenticated MCP call");
		}
		if (String(request.getMethod()).toUpperCase() !== "POST") {
			forbidden(env, "an administrator change requires POST");
		}
		var expected = env.xsrfToken(session);
		var provided = request.getHeader("X-XSRF-TOKEN") || request.getParameter("__xsrfToken");
		if (!expected || !provided || String(expected) !== String(provided)) {
			forbidden(env, "an administrator change requires the session XSRF token");
		}
		return { kind: "admin", user: env.sessionUser(session) || "admin" };
	}

	// A secret never travels as a value: under a secret key, only a reference to a .secret global symbol, whose default
	// (a test or development value, the real secret being set on each server) is free. Checked through the whole value.
	function checkSecrets(value, path, env) {
		if (Array.isArray(value)) {
			value.forEach(function (item, index) { checkSecrets(item, path + "[" + index + "]", env); });
			return;
		}
		if (value && typeof value === "object") {
			Object.keys(value).forEach(function (key) {
				var item = value[key];
				var child = path ? path + "." + key : key;
				if (SECRET_KEY.test(key) && (typeof item !== "object" || item === null)
						&& !SECRET_REFERENCE.test(String(item === null || item === undefined ? "" : item))) {
					env.raise("CONFIG_SECRET_LITERAL", "A secret value is not accepted: " + child,
						null, "Reference a .secret global symbol instead, with a default if useful: \"${<project>.<usage>.<name>.secret=<default>}\".");
				}
				checkSecrets(item, child, env);
			});
			return;
		}
	}

	function pathParts(text, env) {
		var parts = String(text || "").split(".");
		parts.forEach(function (part) {
			if (!NAME.test(part) || part === "__proto__" || part === "constructor" || part === "prototype") {
				env.raise("CONFIG_PATH_INVALID", "Invalid configuration path: " + text,
					null, "Use dot-separated names, such as data.sources.orders.");
			}
		});
		return parts;
	}

	function valueAt(root, parts) {
		var current = root;
		for (var i = 0; i < parts.length; i++) {
			if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, parts[i])) {
				return undefined;
			}
			current = current[parts[i]];
		}
		return current;
	}

	function copy(value) {
		return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
	}

	/**
	 * Changes a value of a named configuration of a project (engine.yaml): default is the config branch, a named
	 * configuration its configs.<name> branch. The revision is the one of the source as edited (working copy
	 * included); a dry run tells the change without writing; a draft is the working copy the Save of the project
	 * publishes; save writes engine.yaml alone, refused when engine.yaml already has a draft.
	 */
	function configMutate(request, convertigoContext, env) {
		request = request || {};
		var who = principal(convertigoContext, env);
		var project = String(request.project || "");
		if (!project) {
			env.raise("CONFIG_PROJECT_REQUIRED", "config.mutate requires the project to change.");
		}
		var flowEngine = env.projectFlowEngine(project);
		if (!flowEngine) {
			env.raise("CONFIG_PROJECT_UNKNOWN", "No loaded Flow project named " + project + ".");
		}
		var configuration = String(request.configuration || "default");
		if (configuration !== "default" && !NAME.test(configuration)) {
			env.raise("CONFIG_CONFIGURATION_INVALID", "Invalid configuration name: " + configuration);
		}
		var op = String(request.op || "set");
		if (["set", "merge", "remove"].indexOf(op) === -1) {
			env.raise("CONFIG_OP_INVALID", "op must be set, merge or remove.");
		}
		var parts = pathParts(request.path, env);
		if (op !== "remove") {
			if (request.value === undefined) {
				env.raise("CONFIG_VALUE_REQUIRED", "config.mutate " + op + " requires a value.");
			}
			if (op === "merge" && (!request.value || typeof request.value !== "object" || Array.isArray(request.value))) {
				env.raise("CONFIG_VALUE_INVALID", "merge requires an object value.");
			}
			checkSecrets(request.value, parts.join("."), env);
		}
		var persist = request.dryRun === true ? "none" : String(request.persist || "draft");
		if (["none", "draft", "save"].indexOf(persist) === -1) {
			env.raise("CONFIG_PERSIST_INVALID", "persist must be draft or save.");
		}
		var source = String(flowEngine.getEngineSource());
		var previousRevision = env.sha256Hex(source);
		if (persist !== "none") {
			if (!request.revision) {
				env.raise("CONFIG_REVISION_REQUIRED", "Pass the revision of engine.yaml read before the change (previousRevision of a dry run).");
			}
			if (String(request.revision) !== previousRevision) {
				conflict(previousRevision, env);
			}
		}
		var definition = env.parseYamlSource(source, "version: 1\n") || {};
		var base = configuration === "default" ? ["config"] : ["configs", configuration];
		if (configuration !== "default" && (!definition.configs || !Object.prototype.hasOwnProperty.call(definition.configs, configuration))) {
			env.raise("CONFIG_CONFIGURATION_UNKNOWN", "No configuration named " + configuration + " in " + project + ".",
				null, "Create the configuration in the Studio first.");
		}
		var full = base.concat(parts);
		var before = copy(valueAt(definition, full));
		var mutated = env.applyEngineMutation(source, { op: op, path: full.join("."), value: request.value });
		var after = copy(valueAt(env.parseYamlSource(mutated, "version: 1\n") || {}, full));
		var result = {
			ok: true,
			project: project,
			configuration: configuration,
			path: parts.join("."),
			op: op,
			changed: mutated !== source,
			before: before === undefined ? null : before,
			after: after === undefined ? null : after,
			previousRevision: previousRevision,
			revision: env.sha256Hex(mutated),
			persisted: "none",
			dryRun: persist === "none"
		};
		if (persist === "none" || !result.changed) {
			return result;
		}
		if (persist === "save") {
			env.saveEngineSource(flowEngine, project, source, mutated, function () { conflict(previousRevision, env); });
			result.persisted = "saved";
		} else {
			env.draftEngineSource(flowEngine, source, mutated, function () { conflict(previousRevision, env); });
			result.persisted = "draft";
		}
		env.log("(config.mutate) " + who.kind + " " + who.user + ": " + op + " " + project + " "
			+ configuration + " " + result.path + " (" + result.persisted + ")");
		return result;
	}

	/**
	 * Adopts a result schema, as the owner of an unstructured source does once the data is known: the output of a Flow
	 * (_flow.outputs, in the working copy of its source) or the output of one of its nodes (its schema file, which has
	 * no working copy). A proposal is never adopted implicitly: the caller passes the complete schema. The revision is
	 * the one of what is replaced (the Flow source as edited, or the node schema), flowRevision optionally the one of
	 * the Flow the caller read, so that a change of the target is a conflict.
	 */
	function schemaAdopt(request, convertigoContext, env) {
		request = request || {};
		var who = principal(convertigoContext, env);
		var qname = String(request.qname || "");
		var dot = qname.indexOf(".");
		if (dot <= 0 || dot === qname.length - 1) {
			env.raise("SCHEMA_QNAME_REQUIRED", "schema.adopt requires the qname of the Flow, Project.Flow.");
		}
		var project = qname.substring(0, dot), name = qname.substring(dot + 1);
		var flow = env.projectFlow(project, name);
		if (!flow) {
			env.raise("SCHEMA_FLOW_UNKNOWN", "No Flow named " + qname + ".");
		}
		var schema = request.schema !== undefined && request.schema !== null ? request.schema : request.proposal;
		if (!schema || typeof schema !== "object" || Array.isArray(schema) || !Object.keys(schema).length) {
			env.raise("SCHEMA_REQUIRED", "schema.adopt requires the complete schema to adopt.");
		}
		var persist = request.dryRun === true ? "none" : String(request.persist || "draft");
		if (["none", "draft", "save"].indexOf(persist) === -1) {
			env.raise("SCHEMA_PERSIST_INVALID", "persist must be draft or save.");
		}
		var source = String(flow.getFlowSource());
		var flowRevision = env.sha256Hex(source);
		if (request.flowRevision && String(request.flowRevision) !== flowRevision) {
			conflict(flowRevision, env, "SCHEMA_REVISION_CONFLICT");
		}
		var node = String(request.node || "");
		var result = { ok: true, qname: qname, target: node ? "node" : "flow", node: node || null, dryRun: persist === "none", persisted: "none" };
		if (!node) {
			var definition = env.flowDefinition(source) || {};
			var before = copy(definition.flow && definition.flow.outputs);
			// _flow.outputs holds the properties of the result object
			var outputs = schema.type === "object" && schema.properties && typeof schema.properties === "object" ? schema.properties : schema;
			var mutated = env.applyFlowMutation(source, name, { op: "replace", path: "/flow/outputs", value: outputs });
			var after = copy((env.flowDefinition(mutated) || {}).flow);
			result.path = "_flow.outputs";
			result.before = before === undefined ? null : before;
			result.after = after && after.outputs !== undefined ? after.outputs : null;
			result.previousRevision = flowRevision;
			result.revision = env.sha256Hex(mutated);
			result.changed = mutated !== source;
			if (persist !== "none") {
				requireRevision(request, flowRevision, env);
				if (result.changed) {
					if (persist === "save") {
						env.saveFlowSource(flow, source, mutated, function () { conflict(flowRevision, env, "SCHEMA_REVISION_CONFLICT"); });
						result.persisted = "saved";
					} else {
						env.draftFlowSource(flow, source, mutated, function () { conflict(flowRevision, env, "SCHEMA_REVISION_CONFLICT"); });
						result.persisted = "draft";
					}
				}
			}
		} else {
			var current = env.nodeSchema(project, name, node, null);
			var previous = current.schema === undefined ? null : current.schema;
			result.path = current.file || "";
			result.before = copy(previous);
			result.after = copy(schema);
			result.previousRevision = env.sha256Hex(JSON.stringify(previous));
			result.revision = env.sha256Hex(JSON.stringify(schema));
			result.changed = JSON.stringify(previous) !== JSON.stringify(schema);
			if (persist !== "none") {
				requireRevision(request, result.previousRevision, env);
				if (result.changed) {
					var written = env.nodeSchema(project, name, node, schema);
					result.path = written.file || result.path;
					// a node schema has no working copy: draft and save both write its file
					result.persisted = "saved";
				}
			}
		}
		if (result.persisted !== "none") {
			env.log("(schema.adopt) " + who.kind + " " + who.user + ": " + qname + (node ? " node " + node : " outputs")
				+ " (" + result.persisted + ")");
		}
		return result;
	}

	function requireRevision(request, revision, env) {
		if (!request.revision) {
			env.raise("SCHEMA_REVISION_REQUIRED", "Pass the revision read before the change (previousRevision of a dry run).");
		}
		if (String(request.revision) !== revision) {
			conflict(revision, env, "SCHEMA_REVISION_CONFLICT");
		}
	}

	function conflict(revision, env, code) {
		var error = new Error(code === "SCHEMA_REVISION_CONFLICT" ? "The target changed since it was read." : "The configuration changed since it was read.");
		error.code = code || "CONFIG_REVISION_CONFLICT";
		error.revision = revision;
		error.hint = "Read it again (dry run) and confirm with the new previousRevision.";
		throw error;
	}

	return {
		PRINCIPAL_ATTRIBUTE: PRINCIPAL_ATTRIBUTE,
		principal: principal,
		checkSecrets: checkSecrets,
		configMutate: configMutate,
		schemaAdopt: schemaAdopt
	};
}())
