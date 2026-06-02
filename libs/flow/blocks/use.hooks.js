(function () {
	function isObject(value) {
		return value && Object.prototype.toString.call(value) === "[object Object]";
	}

	function hasInputDescriptor(value) {
		return isObject(value) && value.value !== undefined;
	}

	function inputValue(ctx, value) {
		if (hasInputDescriptor(value)) {
			return ctx.input(value);
		}
		if (typeof value === "string") {
			return ctx.expr(value);
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(function (item) {
				return inputValue(ctx, item);
			});
		}
		if (isObject(value)) {
			var out = {};
			Object.keys(value).forEach(function (key) {
				out[key] = inputValue(ctx, value[key]);
			});
			return out;
		}
		return ctx.literal(value);
	}

	function contracts(definition) {
		var raw = definition.contracts || {};
		var out = {};
		if (Object.prototype.toString.call(raw) === "[object Array]") {
			raw.forEach(function (item) {
				if (item && (item.name || item.contract)) {
					out[String(item.name || item.contract)] = item;
				}
			});
			return out;
		}
		return raw;
	}

	function findContract(definition, name) {
		var all = contracts(definition || {});
		if (all[name]) {
			return all[name];
		}
		var shortName = String(name || "").split("@")[0];
		return all[shortName] || null;
	}

	function bindingFrom(bindings, name) {
		if (typeof bindings === "string" && bindings.trim() !== "") {
			try {
				bindings = JSON.parse(bindings);
			} catch (e) {
				bindings = {};
			}
		}
		if (!bindings) {
			return "";
		}
		if (bindings[name]) {
			return bindings[name];
		}
		var shortName = String(name || "").split("@")[0];
		return bindings[shortName] || "";
	}

	function resolveImplementation(ctx, props, contract) {
		if (props.implementation) {
			return String(props.implementation);
		}
		var fromFlow = bindingFrom(ctx.definition.bindings || ctx.definition.binding, props.contract);
		if (fromFlow) {
			return String(fromFlow);
		}
		var fromConfig = bindingFrom(ctx.scopes.config.bindings || ctx.scopes.config.binding, props.contract);
		if (fromConfig) {
			return String(fromConfig);
		}
		var fromProjectEngine = bindingFrom(ctx.engine && (ctx.engine.bindings || ctx.engine.binding), props.contract);
		if (fromProjectEngine) {
			return String(fromProjectEngine);
		}
		if (contract && contract.defaultImplementation) {
			return String(contract.defaultImplementation);
		}
		ctx.raise("NO_IMPLEMENTATION_FOR_CONTRACT",
			"No implementation for Flow contract: " + props.contract,
			null,
			"Add a node implementation, a Flow/project binding, or defaultImplementation on the contract.");
		return "";
	}

	return {
		displayName: function (node) {
			var props = node && node.props || node || {};
			return flowSummary.output(node, flowSummary.text(props.contract || "contract"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		}
	};
}())
