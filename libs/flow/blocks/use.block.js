const _meta = {
  "version": 1,
  "icon": "mdi:puzzle-outline",
  "tags": [
    "control"
  ],
  "description": "Runs the implementation bound to a contract. Falls back to contract.defaultImplementation.",
  "properties": {
    "contract": {
      "label": "contract",
      "kind": "text",
      "type": "string",
      "default": "",
      "description": "Contract name to resolve."
    },
    "implementation": {
      "label": "implementation",
      "kind": "text",
      "type": "string",
      "description": "Optional implementation flow overriding the binding."
    },
    "input": {
      "label": "input",
      "kind": "expression",
      "type": "object",
      "description": "Object expression passed to the implementation flow."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.value",
      "description": "Scope path receiving the implementation result."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "use.hooks.js"
  }
}

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
		run: function (ctx, node) {
			var props = ctx.props(node);
			var contract = findContract(ctx.definition, String(props.contract || ""));
			var implementation = resolveImplementation(ctx, props, contract);
			var flow = ctx.flowGet(implementation);
			var childInput = inputValue(ctx, props.input || {});
			var execution = ctx.runFlowSource(flow.source, ctx.scopes.config, {
				input: childInput,
				context: {
					input: childInput
				},
				includeTrace: false
			});
			return execution.result;
		}
	};
}())
