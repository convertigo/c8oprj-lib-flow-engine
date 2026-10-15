(function () {
	function addUnique(items, value) {
		if (typeof value === "string" && value !== "" && items.indexOf(value) === -1) {
			items.push(value);
		}
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
		collectScopeRefs: collectScopeRefs,
		collectExpressionRefs: collectExpressionRefs,
		collectTemplateRefs: collectTemplateRefs,
		exactTemplateExpression: exactTemplateExpression,
		collectConfigKeys: collectConfigKeys
	};
})();
