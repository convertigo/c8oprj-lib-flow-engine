const _meta = {
  "version": 1,
  "icon": "mdi:link-variant",
  "tags": [
    "requestable",
    "call",
    "sequence",
    "transaction",
    "flow",
    "connector",
    "sdk"
  ],
  "description": "Calls a Convertigo sequence, Flow or transaction through the regular requestable path.",
  "properties": {
    "requestable": {
      "label": "requestable",
      "kind": "requestable",
      "type": "requestable",
      "default": "",
      "description": "Target requestable: project.sequence, project.flow, project.connector.transaction, .sequence or .connector.transaction. Current-project calls start with a dot."
    },
    "input": {
      "label": "input",
      "kind": "template",
      "type": "object",
      "description": "Input variables passed to the requestable. Cache controls __responseExpiryDate and __nocache preserve the regular Convertigo requestable boundary."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.requestable",
      "description": "Scope path receiving the requestable JSON response."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "call.hooks.js"
  }
}

(function () {
	var HashMap = Packages.java.util.HashMap;
	var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
	var FlowEngineBridge = Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge;
	var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;

	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function hasTemplate(value) {
		return String(value || "").indexOf("{{") !== -1;
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
				var length = Packages.java.lang.reflect.Array.getLength(value);
				var items = [];
				for (var i = 0; i < length; i++) {
					items.push(Packages.java.lang.reflect.Array.get(value, i));
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
		var strings = Packages.java.lang.reflect.Array.newInstance(Packages.java.lang.String, items.length);
		for (var i = 0; i < items.length; i++) {
			Packages.java.lang.reflect.Array.set(strings, i, requestValue(items[i]));
		}
		return strings;
	}

	function putInput(request, input, target) {
		Object.keys(input || {}).forEach(function (key) {
			request.put(String(key), inputValue(target, key, input[key]));
		});
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
				var dbo = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager.getDatabaseObjectByQName(qnameFor(candidate));
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

	function requestFromTarget(target) {
		var request = new HashMap();
		request.put("__project", target.project);
		request.put("__context", "flow-" + String(Packages.java.util.UUID.randomUUID()));
		request.put("__removeContext", "true");
		if (target.kind === "transaction") {
			request.put("__connector", target.connector);
			request.put("__transaction", target.transaction || target.requestable);
		} else {
			request.put("__sequence", target.sequence || target.requestable);
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

	function runFlowDirect(ctx, target, input) {
		var project = target.flow.getProject();
		var execution = ctx.runFlowSource(String(target.flow.getFlowSource()), {}, {
			project: target.project,
			projectDir: String(project.getDirPath()),
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
		return {
			error: execution && execution.error ? execution.error : {
				code: "FLOW_REQUESTABLE_FAILED",
				message: "The called Flow did not return a result."
			}
		};
	}

	function runInternal(ctx, target, input) {
		if (!target || !target.project || !target.requestable) {
			ctx.raise("INVALID_REQUESTABLE_TARGET", "Invalid requestable target.");
		}
		if (canRunFlowDirect(ctx, target, input)) {
			return runFlowDirect(ctx, target, input);
		}
		var request = requestFromTarget(target);
		putInput(request, input, target);
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
		run: function (ctx, node) {
			var props = ctx.props(node);
			var target = resolveTarget(ctx, ctx.template(props.requestable || ""));
			return runInternal(ctx, target, ctx.template(props.input) || {});
		}
	};
}())
