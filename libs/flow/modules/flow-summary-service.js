(function () {
	var SUMMARY_LIMIT = 72;

	function text(value, max) {
		var out = value === undefined || value === null ? "" : String(value);
		out = out.replace(/\s+/g, " ").trim();
		max = Number(max || SUMMARY_LIMIT);
		if (max > 3 && out.length > max) {
			return out.substring(0, max - 3) + "...";
		}
		return out;
	}

	function value(input, max, env) {
		if (input === undefined) {
			return "";
		}
		if (input === null) {
			return "null";
		}
		if (typeof input === "string") {
			var exact = input.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
			if (exact) {
				return text(exact[1], max);
			}
			return text(input, max);
		}
		try {
			return text(JSON.stringify(env.normalizeTree(input)), max);
		} catch (e) {
			return text(input, max);
		}
	}

	function prop(node, key, env) {
		return env.nodeProps(node)[key];
	}

	function hasProp(props, key) {
		return props && props[key] !== undefined;
	}

	function input(node, env) {
		var props = env.nodeProps(node);
		if (hasProp(props, "value")) {
			return value(props.value, undefined, env);
		}
		return "";
	}

	function assignment(node, operator, env) {
		var props = env.nodeProps(node);
		var path = text(props.path || props.out);
		var inputText = input(node, env);
		if (!path) {
			return inputText;
		}
		return inputText ? path + " " + (operator || "=") + " " + inputText : path;
	}

	function output(node, action, env) {
		var props = env.nodeProps(node);
		var actionText = text(action);
		var out = text(props.out);
		return actionText && out ? actionText + " -> " + out : actionText || out;
	}

	function create(env) {
		return {
			text: text,
			value: function (inputValue, max) {
				return value(inputValue, max, env);
			},
			prop: function (node, key) {
				return prop(node, key, env);
			},
			input: function (node) {
				return input(node, env);
			},
			assignment: function (node, operator) {
				return assignment(node, operator, env);
			},
			output: function (node, action) {
				return output(node, action, env);
			}
		};
	}

	return {
		text: text,
		value: value,
		prop: prop,
		input: input,
		assignment: assignment,
		output: output,
		create: create
	};
})();
