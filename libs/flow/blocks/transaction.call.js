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
		var connector = String(ctx.template(props.connector || ""));
		var transaction = String(ctx.template(props.transaction || ""));
		var parts = transaction.split(".");
		if (parts.length >= 3 && !props.project && !props.connector) {
			project = parts.slice(0, parts.length - 2).join(".");
			connector = parts[parts.length - 2];
			transaction = parts[parts.length - 1];
		} else if (parts.length === 2 && !props.connector) {
			connector = parts[0];
			transaction = parts[1];
		}
		return {
			project: project,
			connector: connector,
			transaction: transaction
		};
	}

	function runInternal(ctx, target, input) {
		var request = new HashMap();
		request.put("__project", target.project);
		request.put("__connector", target.connector);
		request.put("__transaction", target.transaction);
		putInput(request, input);
		var doc = new InternalRequester(request, ctx.convertigoContext().httpServletRequest).processRequest();
		return JSON.parse(String(XMLUtils.XmlToJson(doc.getDocumentElement(), true)));
	}

	return {
		name: "transaction.call",

		catalog: function () {
			return {
				name: "transaction.call",
				icon: "mdi:database-arrow-right-outline",
				props: {
					project: { label: "project", kind: "template", type: "string", description: "Optional target project. Defaults to the current project." },
					connector: { label: "connector", kind: "template", type: "string", description: "Target connector name." },
					transaction: { label: "transaction", kind: "template", type: "string", "default": "", description: "Target transaction name, connector.transaction or project.connector.transaction QName." },
					input: { label: "input", kind: "template", type: "object", description: "Input variables passed to the transaction." },
					out: { label: "out", kind: "path", mode: "write", "default": "flow.transaction", description: "Scope path receiving the transaction JSON response." }
				},
				description: "Calls a Convertigo transaction through the internal requester."
			};
		},

		displayName: function (node) {
			var connector = prop(node, "connector");
			var transaction = prop(node, "transaction") || "transaction";
			return flowSummary.output(node, flowSummary.text(connector ? connector + "." + transaction : transaction));
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
