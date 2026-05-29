(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function logger(name) {
		var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
		if (name === "engine") {
			return Engine.logEngine;
		}
		if (name === "user") {
			return Engine.logUser;
		}
		if (name === "audit") {
			return Engine.logAudit;
		}
		if (name === "beans") {
			return Engine.logBeans;
		}
		return Engine.logContext;
	}

	function write(log, level, message) {
		level = String(level || "info").toLowerCase();
		if (level === "error") {
			log.error(message);
		} else if (level === "warn" || level === "warning") {
			log.warn(message);
		} else if (level === "debug") {
			log.debug(message);
		} else if (level === "trace") {
			log.trace(message);
		} else {
			log.info(message);
		}
	}

	return {
		name: "log",

		catalog: function () {
			return {
				name: "log",
				icon: "mdi:console",
				props: {
					level: { label: "level", kind: "text", type: "string", "default": "info", description: "Log level: error, warn, info, debug or trace." },
					logger: { label: "logger", kind: "text", type: "string", "default": "context", description: "Convertigo logger: context, engine, user, audit or beans." },
					message: { label: "message", kind: "template", type: "string", "default": "", description: "Message template to write." },
					data: { label: "data", kind: "value", type: "unknown", description: "Optional structured value appended as JSON." }
				},
				description: "Writes a diagnostic message to a Convertigo logger."
			};
		},

		displayName: function (node) {
			var level = prop(node, "level") || "info";
			var message = flowSummary.prop(node, "message") || "message";
			return flowSummary.text(String(level).toLowerCase() + " " + message);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var message = String(ctx.template(props.message || ""));
			if (props.data !== undefined) {
				message += " " + JSON.stringify(ctx.input({ value: props.data }));
			}
			write(logger(String(props.logger || "context").toLowerCase()), props.level, message);
			return {
				level: String(props.level || "info").toLowerCase(),
				message: message
			};
		}
	};
}())
