(function () {
	function addUnique(items, value, positions) {
		if (typeof value !== "string" || value === "") return;
		// Only cache a positive lookup, and validate its position before reuse.
		// Hooks and graph-scope restoration may edit an array in place, even
		// without changing its length. A cached absence would then be unsafe.
		if (positions && positions[value] !== undefined && items[positions[value]] === value) return;
		var position = items.indexOf(value);
		if (position === -1) {
			position = items.length;
			items.push(value);
		}
		if (positions) positions[value] = position;
	}

	function createUniqueAdder() {
		var previousItems;
		var positions;
		return function (items, value) {
			if (items !== previousItems) {
				previousItems = items;
				positions = Object.create(null);
			}
			addUnique(items, value, positions);
		};
	}

	function addConfigKey(keys, value) {
		if (typeof value !== "string") {
			return;
		}
		function addPath(path) {
			if (path.indexOf("config.") !== 0) {
				return;
			}
			var key = path.substring("config.".length).split(".")[0];
			if (key && keys.indexOf(key) === -1) {
				keys.push(key);
			}
		}
		value.replace(/\bconfig(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+/g, function (path) {
			addPath(path);
			return path;
		});
	}

	function walkTree(value, callback) {
		if (typeof value === "string") {
			callback(value);
		} else if (value && Object.prototype.toString.call(value) === "[object Array]") {
			value.forEach(function (item) {
				walkTree(item, callback);
			});
		} else if (value && typeof value === "object") {
			Object.keys(value).forEach(function (key) {
				walkTree(value[key], callback);
			});
		}
	}

	function collectScopeRefs(value, refs, env) {
		refs = refs || [];
		walkTree(value, function (text) {
			if (env.isScopePath(text)) {
				addUnique(refs, text);
			}
			env.templateSyntax.expressions(text).forEach(function (ref) {
				if (env.isScopePath(ref)) {
					addUnique(refs, ref);
				}
			});
		});
		return refs;
	}

	function collectExpressionRefs(value, refs, env) {
		refs = refs || [];
		walkTree(value, function (text) {
			var scopePattern = env.scopeNames.join("|");
			var scopeRegExp = new RegExp("\\b(" + scopePattern + ")(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*", "g");
			text.replace(scopeRegExp, function (path) {
				if (env.isScopePath(path)) {
					addUnique(refs, path);
				}
				return path;
			});
		});
		return refs;
	}

	function collectTemplateRefs(value, refs, env) {
		refs = refs || [];
		walkTree(value, function (text) {
			env.templateSyntax.expressions(text).forEach(function (expression) {
				collectExpressionRefs(expression, refs, env);
			});
		});
		return refs;
	}

	function exactTemplateExpression(value, env) {
		return env.templateSyntax.exactExpression(value);
	}

	function collectConfigKeys(value, keys) {
		keys = keys || [];
		walkTree(value, function (text) {
			addConfigKey(keys, text);
		});
		return keys;
	}

	return {
		addUnique: addUnique,
		createUniqueAdder: createUniqueAdder,
		collectScopeRefs: collectScopeRefs,
		collectExpressionRefs: collectExpressionRefs,
		collectTemplateRefs: collectTemplateRefs,
		exactTemplateExpression: exactTemplateExpression,
		collectConfigKeys: collectConfigKeys
	};
})();
