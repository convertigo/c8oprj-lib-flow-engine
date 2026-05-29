(function () {
	var HashMap = Packages.java.util.HashMap;
	var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
	var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;

	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
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

	function parseTarget(ctx, props) {
		var project = String(ctx.template(props.project || "") || ctx.scopes.request.project || "");
		var sequence = String(ctx.template(props.sequence || ""));
		var parts = sequence.split(".");
		if (parts.length >= 2 && !props.project) {
			project = parts.slice(0, parts.length - 1).join(".");
			sequence = parts[parts.length - 1];
		}
		return {
			project: project,
			sequence: sequence
		};
	}

	function runInternal(ctx, target, input) {
		var request = new HashMap();
		request.put("__project", target.project);
		request.put("__sequence", target.sequence);
		putInput(request, input);
		var doc = new InternalRequester(request, ctx.convertigoContext().httpServletRequest).processRequest();
		return JSON.parse(String(XMLUtils.XmlToJson(doc.getDocumentElement(), true)));
	}

	return {
		name: "sequence.call",

		catalog: function () {
			return {
				name: "sequence.call",
				icon: "mdi:script-text-play-outline",
				props: {
					project: { label: "project", kind: "template", type: "string", description: "Optional target project. Defaults to the current project." },
					sequence: { label: "sequence", kind: "template", type: "string", "default": "", description: "Target sequence name or project.sequence QName." },
					input: { label: "input", kind: "template", type: "object", description: "Input variables passed to the sequence." },
					out: { label: "out", kind: "path", mode: "write", "default": "flow.sequence", description: "Scope path receiving the sequence JSON response." }
				},
				description: "Calls a Convertigo sequence through the internal requester."
			};
		},

		displayName: function (node) {
			return flowSummary.output(node, flowSummary.text(prop(node, "sequence") || "sequence"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return runInternal(ctx, parseTarget(ctx, props), ctx.template(props.input) || {});
		}
	};
}())
