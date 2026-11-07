const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:link-variant",
  "tags": [
    "requestable",
    "call",
    "sequence",
    "transaction",
    "flow",
    "connector",
    "sdk",
  ],
  "description": "Calls a Convertigo sequence, Flow or transaction through the regular requestable path.",
  "longDescription": "The value of a Flow call is the result of the called Flow as it is, with no envelope: a Flow writing result.items and result.total gives { items, total }, read local.list.items. It is the body of its HTTP .json answer without the attr metadata. requestable-execute of the MCP shows that answer under its own payload key, beside attr: a Flow that wraps its answer in result.payload is read local.list.payload.items here and payload.payload.items there. A sequence or a transaction gives its document as JSON. When the called Flow throws, the call fails with its error (see onError).",
  "summary": "call {{requestable}}",
  "properties": {
    "requestable": {
      "label": "Requestable",
      "kind": "requestable",
      "type": "requestable",
      "default": "",
      "description": "Target requestable: project.sequence, project.flow, project.connector.transaction, .sequence or .connector.transaction. Current-project calls start with a dot.",
    },
    "input": {
      "label": "Input variables",
      "kind": "template",
      "type": "object",
      "description": "Input variables passed to the requestable. Cache controls __responseExpiryDate and __nocache preserve the regular Convertigo requestable boundary. Any other key starting with __ or convertigo., apart from __nativeCall, is refused (REQUESTABLE_RESERVED_INPUT): the requestable and its context come from the definition.",
    },
    "onError": {
      "label": "On error",
      "kind": "select",
      "type": "string",
      "enum": ["raise", "return"],
      "default": "raise",
      "description": "When the called Flow fails (a throw, a failed block): raise makes this call fail with the code, message, status and details of that error, as a failing block does, so the caller stops unless a try catches it (an access check called before a read or a write is enforced); return gives the value { error: { code, message, status, path } } instead, for a caller that handles the failure itself.",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "description": "The result of the called Flow as it is (result.items gives { items }), or the document of a sequence or a transaction; { error } with onError return when it fails.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "call.hooks.js",
  },
}

(function () {
	// Classes of the JDK and of the engine, resolved with the module (shared by the frames of a runtime): from the engine
	// that evaluates it (flowEngineClass, kept for the runtime), else by full name. Through the Packages of a call, each
	// use looked up the names of its packages as classes again.
	function javaClass(name) {
		return typeof flowEngineClass === "function" ? flowEngineClass(name) : Packages[name];
	}
	var HashMap = javaClass("java.util.HashMap");
	var JavaArray = javaClass("java.lang.reflect.Array");
	var JavaString = javaClass("java.lang.String");
	var CharSequence = javaClass("java.lang.CharSequence");
	var UUID = javaClass("java.util.UUID");
	var Engine = javaClass("com.twinsoft.convertigo.engine.Engine");
	var TagManager = javaClass("com.twinsoft.convertigo.engine.tags.TagManager");
	var InternalRequester = javaClass("com.twinsoft.convertigo.engine.requesters.InternalRequester");
	var NativeJsonRequester = javaClass("com.twinsoft.convertigo.engine.requesters.NativeJsonRequester");
	var nativeBoundaryAvailable = typeof NativeJsonRequester === "function";
	var FlowEngineBridge = javaClass("com.twinsoft.convertigo.engine.flow.FlowEngineBridge");
	var XMLUtils = javaClass("com.twinsoft.convertigo.engine.util.XMLUtils");

	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function hasTemplate(value) {
		return /\$\{|\{\{/.test(String(value || ""));
	}

	function requestValue(value) {
		if (value === undefined || value === null) {
			return "";
		}
		return typeof value === "string" ? value : JSON.stringify(value);
	}

	function arrayItems(value) {
		if (Array.isArray(value)) {
			return value;
		}
		try {
			if (value && value.getClass && value.getClass().isArray()) {
				var length = JavaArray.getLength(value);
				var items = [];
				for (var i = 0; i < length; i++) {
					items.push(JavaArray.get(value, i));
				}
				return items;
			}
			if (value && typeof value.size === "function" && typeof value.get === "function") {
				var size = Number(value.size());
				var list = [];
				for (var j = 0; j < size; j++) {
					list.push(value.get(j));
				}
				return list;
			}
		} catch (e) {
		}
		return null;
	}

	function isMultiValuedInput(target, key) {
		try {
			var variable = target && target.dbo && target.dbo.getVariable ? target.dbo.getVariable(String(key)) : null;
			return !!(variable && variable.isMultiValued && variable.isMultiValued());
		} catch (e) {
			return false;
		}
	}

	function inputValue(target, key, value) {
		var items = isMultiValuedInput(target, key) ? arrayItems(value) : null;
		if (items === null) {
			return requestValue(value);
		}
		var strings = JavaArray.newInstance(JavaString, items.length);
		for (var i = 0; i < items.length; i++) {
			JavaArray.set(strings, i, requestValue(items[i]));
		}
		return strings;
	}

	function putInput(request, input, target) {
		Object.keys(input || {}).forEach(function (key) {
			request.put(String(key), inputValue(target, key, input[key]));
		});
	}

	// The controls of the call an input may give: the cache controls (__responseExpiryDate, __nocache) and the native call
	// of a sequence (__nativeCall). Any other key starting with __ or convertigo. is a parameter of the requester (the
	// requestable, its project, its context, the session, the logs), never an input variable: the definition decides it.
	var INPUT_CONTROLS = { __responseExpiryDate: true, __nocache: true, __nativeCall: true };

	function reservedInputKeys(input) {
		return Object.keys(input || {}).filter(function (key) {
			key = String(key);
			return (key.indexOf("__") === 0 || key.indexOf("convertigo.") === 0) && !hasOwn(INPUT_CONTROLS, key);
		});
	}

	// Checked before any path of the call (child execution, direct Flow run, requester), for run and debug.run alike
	function checkInput(ctx, node, input) {
		var keys = reservedInputKeys(input);
		if (keys.length) {
			ctx.throwFlow({
				code: "REQUESTABLE_RESERVED_INPUT",
				message: "The input of a requestable call cannot set parameters of the requester.",
				status: 400,
				details: { keys: keys },
				hint: "Give the variables of the requestable only: the requestable and its context come from the definition. " +
					"Accepted controls: __responseExpiryDate, __nocache, __nativeCall."
			}, node);
		}
	}

	function currentProject(ctx) {
		if (ctx.scopes && ctx.scopes.request && ctx.scopes.request.project) {
			return String(ctx.scopes.request.project);
		}
		return ctx.currentProjectName ? String(ctx.currentProjectName() || "") : "";
	}

	function qnameFor(candidate) {
		return candidate.project + "." + (candidate.connector ? candidate.connector + "." : "") + candidate.requestable;
	}

	function targetCandidates(ctx, target) {
		var project = currentProject(ctx);
		var text = String(target || "").trim();
		if (text.charAt(0) === ".") {
			text = project + text;
		}
		var parts = text.split(".").filter(function (part) {
			return part !== "";
		});
		var candidates = [];
		if (parts.length >= 3) {
			candidates.push({
				kind: "transaction",
				project: parts.slice(0, parts.length - 2).join("."),
				connector: parts[parts.length - 2],
				requestable: parts[parts.length - 1],
				transaction: parts[parts.length - 1]
			});
		} else if (parts.length === 2) {
			candidates.push({
				kind: "sequence",
				project: parts[0],
				requestable: parts[1],
				sequence: parts[1]
			});
		} else if (parts.length === 1 && project) {
			candidates.push({
				kind: "sequence",
				project: project,
				requestable: parts[0],
				sequence: parts[0]
			});
		}
		return candidates;
	}

	function resolveExisting(candidates) {
		for (var i = 0; i < candidates.length; i++) {
			var candidate = candidates[i];
			try {
				var dbo = Engine.theApp.databaseObjectsManager.getDatabaseObjectByQName(qnameFor(candidate));
				if (!dbo) {
					continue;
				}
				if (String(dbo.getProject().getName()) !== String(candidate.project)) {
					continue;
				}
				candidate.dbo = dbo;
				var className = String(dbo.getClass().getName());
				if (className.indexOf(".transactions.") !== -1 || className.indexOf(".beans.core.Transaction") !== -1) {
					candidate.kind = "transaction";
					candidate.connector = candidate.connector || String(dbo.getConnector().getName());
					if (String(dbo.getConnector().getName()) !== String(candidate.connector)) {
						continue;
					}
					candidate.transaction = candidate.requestable;
					return candidate;
				}
				if (className === "com.twinsoft.convertigo.beans.flow.Flow" ||
						className === "com.twinsoft.convertigo.beans.core.Sequence" ||
						className.indexOf(".beans.sequences.") !== -1) {
					candidate.kind = "sequence";
					delete candidate.connector;
					candidate.sequence = candidate.requestable;
					if (className === "com.twinsoft.convertigo.beans.flow.Flow") {
						candidate.flow = dbo;
					}
					return candidate;
				}
			} catch (e) {
			}
		}
		return null;
	}

	function resolveTarget(ctx, target) {
		var candidates = targetCandidates(ctx, target);
		var resolved = resolveExisting(candidates);
		if (resolved) {
			return resolved;
		}
		var candidate = candidates[0];
		var qname = candidate ? qnameFor(candidate) : String(target || "");
		ctx.raise("UNKNOWN_REQUESTABLE", "Unknown Convertigo requestable: " + qname,
			null, "Use .Sequence, .Flow or .Connector.Transaction for the current project; use Project.Sequence or Project.Connector.Transaction for another project.");
	}

	// The input variables, then the routing of the definition over them: no input key, even one checkInput would accept,
	// chooses the project, the requestable or the context of the call.
	function requestFromTarget(target, input) {
		var request = new HashMap();
		putInput(request, input, target);
		request.put("__project", target.project);
		request.put("__context", "flow-" + String(UUID.randomUUID()));
		request.put("__removeContext", "true");
		if (target.kind === "transaction") {
			request.put("__connector", target.connector);
			request.put("__transaction", target.transaction || target.requestable);
			request.remove("__sequence");
		} else {
			request.put("__sequence", target.sequence || target.requestable);
			request.remove("__connector");
			request.remove("__transaction");
		}
		return request;
	}

	function engineQName(value) {
		var name = String(value === undefined || value === null ? "" : value).trim();
		return name || String(FlowEngineBridge.DEFAULT_ENGINE_QNAME);
	}

	function projectEngineQName(project) {
		var flowEngine = project && project.getFlowEngine ? project.getFlowEngine() : null;
		return engineQName(flowEngine && flowEngine.getEngineQName ? flowEngine.getEngineQName() : "");
	}

	function hasOwn(input, key) {
		return !!(input && Object.prototype.hasOwnProperty.call(input, key));
	}

	function requiresRegularRequestBoundary(input) {
		return hasOwn(input, "__responseExpiryDate") || hasOwn(input, "__nocache");
	}

	function canRunFlowDirect(ctx, target, input) {
		return !!(target && target.flow && ctx.runFlowSource && ctx.request &&
			!requiresRegularRequestBoundary(input) &&
			engineQName(ctx.request.engineQName) === projectEngineQName(target.flow.getProject()));
	}

	// The tag context of the called Flow's project, as the regular requestable path captures it for
	// that Flow (server side, from the tag domain): its named configurations are selected by its own
	// tags, never inherited from the caller. Without the Convertigo tag domain (standalone runtime),
	// only a call inside the caller's project can reuse the caller's context.
	function calledFlowTagContext(ctx, project) {
		var name = String(project.getName());
		try {
			return JSON.parse(String(TagManager.get().runContext(project)));
		} catch (_tagDomainUnavailable) {
			var current = ctx.request && ctx.request.tagContext;
			return current && String(current.project || "") === name ? current : undefined;
		}
	}

	function runFlowDirect(ctx, target, input) {
		var project = target.flow.getProject();
		var execution = ctx.runFlowSource(String(target.flow.getFlowSource()), {}, {
			project: target.project,
			projectDir: String(project.getDirPath()),
			// Same identity as a regular call, so the configurations of the called Flow follow its tags.
			flowQName: typeof target.flow.getQName === "function" ? String(target.flow.getQName()) : target.project + "." + target.requestable,
			flowName: target.requestable,
			tagContext: calledFlowTagContext(ctx, project),
			input: input || {},
			context: {
				project: target.project,
				sequence: target.requestable
			},
			includeTrace: false
		});
		if (execution && execution.ok === true) {
			return execution.result;
		}
		return failedCall(execution && execution.error ? execution.error : {
			code: "FLOW_REQUESTABLE_FAILED",
			message: "The called Flow did not return a result."
		}, applicationFailure(execution && execution.error));
	}

	// The error of a called Flow, marked as such: a Flow may also return a result holding an error property.
	// applicative: an application error of the called Flow, raised as an application error of the caller.
	function FailedCall(error, applicative) {
		this.error = error;
		this.applicative = applicative === true;
	}

	function failedCall(error, applicative) {
		return new FailedCall(error, applicative);
	}

	var APPLICATIVE = Object.freeze({ applicative: true });

	// Through a requester, the envelope of a called Flow tells its kind: its run answers status 500 for an internal
	// failure (http-flow-failure.js answerCaller), no status or its own for an application error. An error document of
	// the engine has no operation: an internal failure.
	function applicationFailure(error) {
		return !!error && typeof error === "object" && String(error.operation) === "run" && Number(error.status) !== 500;
	}

	// The failure the engine answers for a Flow run (Engine.js failure("run", e)), alone in its result: { error } with
	// the code, the operation run, the path, the message and the hint. A result built by a Flow carries other keys or
	// an error without operation (onError return gives the error without it). Only a guess, for a Convertigo engine
	// that does not mark its answer (see regularFlowOutcome). A document answer (cache controls, another Flow engine)
	// also holds the attr the requester adds: the failure is then { error, attr }.
	function isFlowFailure(value, documentAnswer) {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return false;
		}
		var keys = Object.keys(value).filter(function (key) { return !(documentAnswer && key === "attr"); });
		var error = value.error;
		return keys.length === 1 && keys[0] === "error" && !!error && typeof error === "object" &&
			String(error.operation) === "run" && error.code !== undefined && error.code !== null &&
			error.message !== undefined && error.hint !== undefined;
	}

	// The answer of a called Flow through the regular requester. A Convertigo engine that marks it says beside the
	// result or the document (failed, NativeJsonRequester.FAILED) whether the requestable failed: a Flow whose run ended
	// in error, or a refusal answered as an error document; its error is then the failure of the call, and a result
	// holding an error property stays a result. Without that marker (an older engine), the shape of the result decides.
	function regularFlowOutcome(answer, value, documentAnswer) {
		var failed = answer && typeof answer === "object" ? answer.failed : undefined;
		if (typeof failed !== "boolean") {
			return isFlowFailure(value, documentAnswer) ? failedCall(value.error, applicationFailure(value.error)) : value;
		}
		if (!failed) {
			return value;
		}
		var error = value && typeof value === "object" ? value.error : undefined;
		return failedCall(error && typeof error === "object" ? error : {
			code: "FLOW_REQUESTABLE_FAILED",
			message: "The called Flow failed."
		}, applicationFailure(error));
	}

	function callOutcome(ctx, node, props, target, value) {
		if (!(value instanceof FailedCall)) {
			return value;
		}
		var error = value.error || {};
		if (String(props.onError || "raise") === "return") {
			var returned = {};
			Object.keys(error).forEach(function (key) {
				if (key !== "operation") {
					returned[key] = error[key];
				}
			});
			return { error: returned };
		}
		// an application error of the called Flow stays one (200 with its envelope when it has no status); its internal
		// failure stays 500, as flow.call, which lets the error of the called Flow through
		var status = Number(error.status), explicit = Number.isInteger(status) && status >= 400 && status <= 599;
		return ctx.throwFlow({
			code: String(error.code || "FLOW_REQUESTABLE_FAILED"),
			message: String(error.message || "The called requestable failed."),
			status: explicit ? status : value.applicative ? undefined : 500,
			details: error.details,
			hint: "Raised by " + qnameFor(target) + (error.path ? " at " + error.path : "")
				+ ". Catch it with try, or set onError: \"return\" to get { error } instead."
		}, node, value.applicative ? APPLICATIVE : undefined);
	}

	function runInternal(ctx, node, target, input) {
		checkInput(ctx, node, input);
		if (!target || !target.project || !target.requestable) {
			ctx.raise("INVALID_REQUESTABLE_TARGET", "Invalid requestable target.");
		}
		if (!nativeBoundaryAvailable && canRunFlowDirect(ctx, target, input)) {
			return runFlowDirect(ctx, target, input);
		}
		if (nativeBoundaryAvailable && ctx.tryDirectRequestable && target.dbo) {
			var direct = ctx.tryDirectRequestable(target.dbo, input);
			if (direct && direct.handled === true) return direct.failed === true ? failedCall(direct.value && direct.value.error, direct.applicative === true) : direct.value;
		}
		var request = requestFromTarget(target, input);
		if (nativeBoundaryAvailable) {
			var requester = new NativeJsonRequester(request, ctx.convertigoContext().httpServletRequest);
			// Explicit native calls retain their business object contract. Keep the
			// regular requester checks, context and billing; other calls are unchanged.
			var nativeSequence = String(input && input.__nativeCall) === "true" &&
				!target.flow && target.kind === "sequence" && target.dbo &&
				typeof target.dbo.isNativeExecution === "function" && target.dbo.isNativeExecution() &&
				typeof target.dbo.isJsonNativeOutput === "function" && target.dbo.isJsonNativeOutput() &&
				typeof requester.processRequestAsObject === "function";
			var rawResult = canRunFlowDirect(ctx, target, input);
			requester.setRawResult(rawResult);
			var result = typeof requester.processRequestAsObject === "function"
				? requester.processRequestAsObject(ctx)
				: JSON.parse(String(requester.processRequest()));
			// The native sequence contract falls back to JSON text when an XML step
			// or an error built a document. Its successful object result stays object-only.
			if (nativeSequence && (typeof result === "string" ||
					typeof CharSequence === "function" && result instanceof CharSequence)) {
				result = JSON.parse(String(result));
			}
			// The requester already detached this response. Studio can reuse its Context for another
			// session before this JS frame resumes: never consult that mutable Context to decode A's result.
			var rawAnswer = rawResult && result && typeof result === "object" &&
				Object.prototype.hasOwnProperty.call(result, "result") && !Object.prototype.hasOwnProperty.call(result, "document");
			var value = rawAnswer ? result.result : unwrapDocument(result);
			// A called Flow that fails answers through the regular requester with its error as its result: it makes
			// the call fail as through the child execution, so an access check is enforced on this path too
			return target.flow ? regularFlowOutcome(result, value, !rawAnswer) : value;
		}
		var doc = new InternalRequester(request, ctx.convertigoContext().httpServletRequest).processRequest();
		return unwrapDocument(JSON.parse(String(XMLUtils.XmlToJson(doc.getDocumentElement(), true, true))));
	}

	function unwrapDocument(value) {
		if (value && typeof value === "object" && value.document !== undefined) {
			return value.document;
		}
		return value;
	}

	function staticTarget(ctx, props) {
		var target = String(props.requestable || "").trim();
		if (!target || hasTemplate(target)) {
			return null;
		}
		return resolveTarget(ctx, target);
	}

	return {
		// No state of its own (constants and pure functions): shared by the frames of a runtime revision
		stateless: true,
		run: function (ctx, node) {
			var props = ctx.props(node);
			var target = resolveTarget(ctx, ctx.template(props.requestable || ""));
			return callOutcome(ctx, node, props, target, runInternal(ctx, node, target, ctx.template(props.input) || {}));
		},
		debug: {
			resolve: function (ctx, node) {
				var props = ctx.props(node),
					name = ctx.template(props.requestable || ""),
					target = resolveTarget(ctx, name),
					args = { requestable: name, input: ctx.template(props.input) || {} };
				Object.defineProperties(args, { __target: { value: target }, __props: { value: props } });
				return args;
			},
			run: function (ctx, node, args) {
				return callOutcome(
					ctx,
					node,
					args.__props,
					args.__target,
					runInternal(ctx, node, args.__target, args.input)
				);
			}
		}
	};
}())
