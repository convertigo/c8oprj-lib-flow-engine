(function () {
	// Per-execution type state, outside data/JSON. Hosts supply scope access and
	// writes (a reactive frontend can notify here); schema rules remain identical.
	function create(env) {
		var roots = new WeakMap(), values = new WeakMap();
		function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
		function fail(code, message) { env.raise(code, message); }
		function parts(path) {
			var checked = env.destinations.validate(path, { roots: env.roots || env.destinations.policy().roots, required: true });
			if (!checked.valid) fail(checked.code, checked.message);
			return checked.parts;
		}
		function assertValue(schema, value, path) {
			var checked = env.schemas.validate(schema, value);
			if (checked.status !== "compatible") fail(checked.status === "unknown" ? "UNKNOWN_VALUE_TYPE" : "VALUE_TYPE_MISMATCH",
				path + ": " + checked.issues.map(function (error) { return error.path + " " + error.message; }).join("; "));
		}
		function child(schema, names) {
			var current = schema;
			for (var i = 0; i < names.length && current; i++) {
				if (current.type !== "object") return false;
				current = own(current.properties || {}, names[i]) ? current.properties[names[i]]
					: current.additionalProperties === false ? false
					: current.additionalProperties && typeof current.additionalProperties === "object" ? current.additionalProperties : null;
			}
			return current;
		}
		function readOwn(value, names) {
			for (var i = 0; i < names.length; i++) {
				if (!value || !own(value, names[i])) return undefined;
				value = value[names[i]];
			}
			return value;
		}
		function table(scopes, names) { return scopes[names[0]] && roots.get(scopes[names[0]]) || {}; }
		function validateWrite(scopes, path, value) {
			var names = String(path).split("."), relative = names.slice(1).join("."), declarations = table(scopes, names);
			Object.keys(declarations).forEach(function (key) {
				if (relative === key) assertValue(declarations[key], value, path);
				else if (relative.indexOf(key + ".") === 0) {
					var expected = child(declarations[key], relative.substring(key.length + 1).split("."));
					if (expected === false) fail("VALUE_TYPE_MISMATCH", path + ": this field is not part of the declared type.");
					if (expected) assertValue(expected, value, path);
				} else if (key.indexOf(relative + ".") === 0) {
					assertValue(declarations[key], readOwn(value, key.substring(relative.length + 1).split(".")), names[0] + "." + key);
				}
			});
		}
		function schemaFor(path) {
			var names = parts(path), scopes = env.scopes(), relative = names.slice(1).join("."), declarations = table(scopes, names);
			var best = "";
			Object.keys(declarations).forEach(function (key) { if ((relative === key || relative.indexOf(key + ".") === 0) && key.length > best.length) best = key; });
			var value = env.read(path);
			return best ? child(declarations[best], relative === best ? [] : relative.substring(best.length + 1).split("."))
				: value && typeof value === "object" ? values.get(value) : null;
		}
		function declare(path, schema, value) {
			var names = parts(path), checked = env.schemas.definition(schema);
			if (!checked.valid) fail("INVALID_SCHEMA", checked.errors.map(function (error) { return error.path + " " + error.message; }).join("; "));
			// Self-compatibility proves that even unpopulated item/value types are known.
			if (env.schemas.compare(schema, schema).status !== "compatible") fail("UNKNOWN_VALUE_TYPE", "Declare a known item/value type before creating a typed collection.");
			var saved = JSON.parse(JSON.stringify(schema)), scopes = env.scopes(), root = scopes[names[0]], key = names.slice(1).join(".");
			var declarations = roots.get(root) || Object.create(null);
			if (own(declarations, key) && (env.schemas.compare(declarations[key], saved).status !== "compatible" || env.schemas.compare(saved, declarations[key]).status !== "compatible")) {
				fail("TYPE_REDECLARATION", "The declared type cannot change during an execution: " + path);
			}
			assertValue(saved, value, path);
			validateWrite(scopes, path, value);
			env.write(path, value);
			declarations[key] = saved; roots.set(root, declarations);
			if (value && typeof value === "object") values.set(value, saved);
			if (!scopes.__flowTypeContracts) Object.defineProperty(scopes, "__flowTypeContracts", { value: { validateWrite: validateWrite }, enumerable: false });
			return value;
		}
		function append(path, value) {
			parts(path);
			var target = env.read(path), schema = schemaFor(path);
			if (target === undefined || target === null) target = [];
			if (!Array.isArray(target)) fail("COLLECTION_REQUIRED", "Choose an array destination: " + path);
			if (schema) assertValue(schema.items || {type:"unknown"}, value, path + "[]");
			var next = target.concat([value]);
			validateWrite(env.scopes(), path, next);
			if (env.preflight) env.preflight(path, next);
			// Validate before mutation; legacy json.push aliases keep observing the same array.
			if (env.immutable) target = next;
			else target.push(value);
			env.write(path, target);
			return target;
		}
		function put(path, key, value) {
			parts(path);
			if (typeof key !== "string" || !key || ["__proto__", "prototype", "constructor"].indexOf(key) >= 0) fail("INVALID_MAP_KEY", "Choose a non-empty map key (reserved prototype names are not allowed).");
			var target = env.read(path), schema = schemaFor(path);
			if (!target || typeof target !== "object" || Array.isArray(target)) fail("COLLECTION_REQUIRED", "Choose a map destination: " + path);
			var next = Object.assign({}, target);
			Object.defineProperty(next, key, {value:value, enumerable:true, writable:true, configurable:true});
			if (schema) assertValue(schema, next, path);
			validateWrite(env.scopes(), path, next);
			if (env.preflight) env.preflight(path, next);
			if (env.immutable) target = next;
			else Object.defineProperty(target, key, {value:value, enumerable:true, writable:true, configurable:true});
			env.write(path, target);
			return target;
		}
		return { declare: declare, append: append, put: put, schemaFor: function (path) {
			var schema = schemaFor(path); return schema ? JSON.parse(JSON.stringify(schema)) : null;
		} };
	}
	return { create: create };
}())
