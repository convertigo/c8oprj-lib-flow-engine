(function () {
	// The protected authoring primitives a Flow may call (config.mutate, schema.adopt). The platform checks the real
	// principal of the root request, whatever the accessibility of the Flows on the way: an administrator over HTTP
	// (POST with the session XSRF token), an authenticated MCP call (marked by the MCP), the Studio, or a server-side
	// origin without HTTP caller. Anyone else gets a plain refusal, dry runs included.
	var PRINCIPAL_ATTRIBUTE = "com.convertigo.flow.principal";
	// keys holding a secret: password, clientSecret, accessToken, apiKey... (not secretFile, a path, nor tokenUrl)
	var SECRET_KEY = /(password|passwd|secret|token|apikey|api_key|privatekey|private_key)$/i;
	var SECRET_REFERENCE = /^\$\{[^}=]+\.secret=?\}$/;
	var NAME = /^[A-Za-z_$][\w$-]*$/;
	var SYMBOL = /\$\{([^}=]+?)(?:=([^}]*))?\}/g;

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

	// A secret never travels as a value: under a secret key, only a reference to a .secret global symbol with an empty
	// default, ${name.secret=}; anywhere, a .secret symbol keeps an empty default. Checked through the whole value.
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
						null, "Reference a global symbol instead: \"${<project>.<usage>.<name>.secret=}\".");
				}
				checkSecrets(item, child, env);
			});
			return;
		}
		if (typeof value === "string") {
			var match;
			SYMBOL.lastIndex = 0;
			while ((match = SYMBOL.exec(value)) !== null) {
				if (/\.secret$/.test(match[1]) && match[2] !== undefined && match[2] !== "") {
					env.raise("CONFIG_SECRET_LITERAL", "A secret symbol keeps an empty default: " + path,
						null, "Write \"${" + match[1] + "=}\" and set its value in the Global symbols page.");
				}
			}
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

	function conflict(revision, env) {
		var error = new Error("The configuration changed since it was read.");
		error.code = "CONFIG_REVISION_CONFLICT";
		error.revision = revision;
		error.hint = "Read it again (dry run) and confirm with the new previousRevision.";
		throw error;
	}

	return {
		PRINCIPAL_ATTRIBUTE: PRINCIPAL_ATTRIBUTE,
		principal: principal,
		checkSecrets: checkSecrets,
		configMutate: configMutate
	};
}())
