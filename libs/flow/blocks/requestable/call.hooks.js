(function () {
	var HashMap = Packages.java.util.HashMap;
	var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
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

	function putInput(request, input) {
		Object.keys(input || {}).forEach(function (key) {
			request.put(String(key), requestValue(input[key]));
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
					return candidate;
				}
			} catch (e) {
			}
		}
		return null;
	}

	function resolveTarget(ctx, target) {
		var candidates = targetCandidates(ctx, target);
		return resolveExisting(candidates);
	}

	function requestFromTarget(target) {
		var request = new HashMap();
		request.put("__project", target.project);
		if (target.kind === "transaction") {
			request.put("__connector", target.connector);
			request.put("__transaction", target.transaction || target.requestable);
		} else {
			request.put("__sequence", target.sequence || target.requestable);
		}
		return request;
	}

	function runInternal(ctx, target, input) {
		if (!target || !target.project || !target.requestable) {
			ctx.raise("INVALID_REQUESTABLE_TARGET", "Invalid requestable target.");
		}
		var request = requestFromTarget(target);
		putInput(request, input);
		var doc = new InternalRequester(request, ctx.convertigoContext().httpServletRequest).processRequest();
		return unwrapDocument(JSON.parse(String(XMLUtils.XmlToJson(doc.getDocumentElement(), true))));
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
		displayName: function (node) {
			return flowSummary.output(node, flowSummary.text(prop(node, "requestable") || "requestable"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
			var target = staticTarget(ctx, props);
			var schema = target && ctx.requestableOutputSchema ? ctx.requestableOutputSchema(target) : null;
			if (schema) {
				ctx.addSchema(props.out, schema);
			}
		}
	};
}())
