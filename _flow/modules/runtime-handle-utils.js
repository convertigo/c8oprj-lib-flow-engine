(function () {
	function defineDataProperty(out, key, value) {
		Object.defineProperty(out, key, { value: value, enumerable: true, configurable: true, writable: true });
	}
	function jsValue(value, env) {
		// A try/catch makes Rhino allocate an activation scope on every call.
		// Keep the primitive guard outside the Java conversion's catch scope.
		if (value === undefined || value === null) {
			return value;
		}
		var valueType = typeof value;
		if (valueType === "string" || valueType === "boolean" || valueType === "number") {
			return value;
		}
		// Ordinary JavaScript containers need no Java unwrapping/catch activation.
		// Keep the compatibility path for custom getClass (including inherited
		// accessors); real host wrappers implement java.lang.Object in Rhino.
		if (env.JavaObject && (valueType === "object" || valueType === "function") &&
			!(value instanceof env.JavaObject) && !("getClass" in value)) return value;
		return unwrapJavaValue(value, env);
	}

	function unwrapJavaValue(value, env) {
		try {
			if (env.NativeJavaObject && value instanceof env.NativeJavaObject) {
				value = value.unwrap();
			}
			if (value && typeof value.getClass === "function") {
				var className = String(value.getClass().getName());
				if (className === "java.lang.String") {
					return String(value);
				}
				if (className === "java.lang.Boolean") {
					return String(value) === "true";
				}
				if (env.JavaNumber && value instanceof env.JavaNumber ||
					className.indexOf("java.lang.") === 0 && className.match(/(Byte|Short|Integer|Long|Float|Double|Number)$/)) {
					return Number(value);
				}
			}
			if (env.JavaString && value instanceof env.JavaString) {
				return String(value);
			}
			if (env.JavaBoolean && value instanceof env.JavaBoolean) {
				return String(value) === "true";
			}
			if (env.JavaNumber && value instanceof env.JavaNumber) {
				return Number(value);
			}
		} catch (e) {
		}
		return value;
	}

	function isHandle(value) {
		return value != null && (typeof value === "object" || typeof value === "function") && value.__flowHandle === true;
	}

	function type(value) {
		return String(value && value.__flowHandleType || "unknown");
	}

	function summary(value) {
		if (!isHandle(value)) {
			return null;
		}
		var out = {
			handle: type(value),
			id: String(value.__flowHandleId || "")
		};
		if (value.__flowHandleLabel !== undefined && value.__flowHandleLabel !== null && value.__flowHandleLabel !== "") {
			out.label = String(value.__flowHandleLabel);
		}
		out.state = value.__flowHandleClosed === true ? "closed" : String(value.__flowHandleState || "open");
		return out;
	}

	// Keep callbacks out of the recursive visitor: Rhino otherwise creates an
	// activation scope even for every primitive leaf. Preserve map overrides/holes.
	function sanitizeArray(value, env, seen, rejectWhere) {
		return value.map(function (item) {
			return sanitizeValue(item, env, seen, rejectWhere);
		});
	}

	function sanitizeValue(value, env, seen, rejectWhere) {
		value = jsValue(value, env);
		if (value === null || (typeof value !== "object" && typeof value !== "function")) {
			return value;
		}
		if (isHandle(value)) {
			if (rejectWhere) {
				env.raise("RUNTIME_HANDLE_IN_RESULT", "Runtime handles cannot be written to " + rejectWhere + ". Convert them to serializable data first.");
			}
			return summary(value);
		}
		if (value && Object.prototype.toString.call(value) === "[object Array]") {
			return sanitizeArray(value, env, seen, rejectWhere);
		}
		if (value && typeof value === "object") {
			seen = seen || [];
			if (seen.indexOf(value) !== -1) {
				return "[Circular]";
			}
			seen.push(value);
			var out = {};
			var keys = Object.keys(value);
			for (var i = 0; i < keys.length; i++) {
				var key = keys[i];
				var child = sanitizeValue(value[key], env, seen, rejectWhere);
				if (key === "__proto__") defineDataProperty(out, key, child);
				else out[key] = child;
			}
			seen.pop();
			return out;
		}
		return value;
	}

	function sanitize(value, env, seen) {
		return sanitizeValue(value, env, seen, "");
	}

	function sanitizeSerializable(value, where, env, seen) {
		return sanitizeValue(value, env, seen, String(where || "result"));
	}

	// Nested callbacks also require an activation scope. Isolate the array
	// callback so every primitive/object visit can use ordinary local variables.
	function normalizeArray(value, env) {
		return value.map(function (item) {
			return normalize(item, env);
		});
	}

	function normalize(value, env) {
		value = jsValue(value, env);
		if (value === null || (typeof value !== "object" && typeof value !== "function")) {
			return value;
		}
		if (isHandle(value)) {
			return summary(value);
		}
		if (value && Object.prototype.toString.call(value) === "[object Array]") {
			return normalizeArray(value, env);
		}
		if (value && typeof value === "object") {
			var out = {};
			var keys = Object.keys(value);
			for (var i = 0; i < keys.length; i++) {
				var key = keys[i];
				var child = normalize(value[key], env);
				if (key === "__proto__") defineDataProperty(out, key, child);
				else out[key] = child;
			}
			return out;
		}
		return value;
	}

	function snapshot(value, env) {
		if (value === undefined || value === null) {
			return value;
		}
		try {
			return JSON.parse(JSON.stringify(sanitize(value, env)));
		} catch (e) {
			return String(value);
		}
	}

	function mergedContext(base, override) {
		var out = {};
		Object.keys(base || {}).forEach(function (key) {
			if (key === "__proto__") defineDataProperty(out, key, base[key]);
			else out[key] = base[key];
		});
		Object.keys(override || {}).forEach(function (key) {
			if (key === "__proto__") defineDataProperty(out, key, override[key]);
			else out[key] = override[key];
		});
		return out;
	}

	function contains(value, env, seen) {
		value = jsValue(value, env);
		if (isHandle(value)) {
			return true;
		}
		if (!value || typeof value !== "object") {
			return false;
		}
		seen = seen || [];
		if (seen.indexOf(value) !== -1) {
			return false;
		}
		seen.push(value);
		var found = false;
		if (Object.prototype.toString.call(value) === "[object Array]") {
			for (var i = 0; i < value.length && !found; i++) {
				found = contains(value[i], env, seen);
			}
		} else {
			var keys = Object.keys(value);
			for (var k = 0; k < keys.length && !found; k++) {
				found = contains(value[keys[k]], env, seen);
			}
		}
		seen.pop();
		return found;
	}

	function assertSerializable(value, where, env) {
		// Native JSON rows remain data until observed or mutated. The Java visitor
		// declines getters, host values and handles without invoking user code.
		if (env.JsonData && env.JsonData.containsNoHandles(value)) return;
		if (contains(value, env)) {
			env.raise("RUNTIME_HANDLE_IN_RESULT", "Runtime handles cannot be written to " + where + ". Convert them to serializable data first.");
		}
	}

	function create(ctx, typeName, value, options) {
		options = options || {};
		ctx.handleSeq = Number(ctx.handleSeq || 0) + 1;
		var id = String(options.id || "h" + ctx.handleSeq);
		var handle = {
			__flowHandle: true,
			__flowHandleId: id,
			__flowHandleType: String(typeName || "unknown"),
			__flowHandleValue: value,
			__flowHandleLabel: options.label || "",
			__flowHandleState: options.state || "open",
			__flowHandleClosed: false,
			__flowHandleClose: typeof options.close === "function" ? options.close : null
		};
		var handles = ctx.handles || (ctx.handles = {});
		handles[id] = handle;
		return handle;
	}

	function close(ctx, handle, env) {
		if (!isHandle(handle)) {
			env.raise("INVALID_RUNTIME_HANDLE", "Expected a runtime handle.");
		}
		if (handle.__flowHandleClosed === true) {
			return summary(handle);
		}
		try {
			if (handle.__flowHandleClose) {
				handle.__flowHandleClose(handle.__flowHandleValue, handle);
			}
		} finally {
			handle.__flowHandleClosed = true;
			handle.__flowHandleState = "closed";
		}
		return summary(handle);
	}

	function closeAll(ctx, env) {
		if (!ctx || !ctx.handles) {
			return;
		}
		var ids = Object.keys(ctx.handles);
		for (var i = 0; i < ids.length; i++) {
			var id = ids[i];
			var handle = ctx.handles[id];
			if (handle && handle.__flowHandleClosed !== true) {
				close(ctx, handle, env);
			}
		}
	}

	function value(handle, expectedType, env) {
		if (!isHandle(handle)) {
			env.raise("INVALID_RUNTIME_HANDLE", "Expected runtime handle" + (expectedType ? " " + expectedType : "") + ".");
		}
		if (expectedType && type(handle) !== String(expectedType)) {
			env.raise("INVALID_RUNTIME_HANDLE_TYPE", "Expected runtime handle " + expectedType + " but got " + type(handle) + ".");
		}
		if (handle.__flowHandleClosed === true) {
			env.raise("CLOSED_RUNTIME_HANDLE", "Runtime handle is closed: " + String(handle.__flowHandleId || ""));
		}
		return handle.__flowHandleValue;
	}

	return {
		jsValue: jsValue,
		isHandle: isHandle,
		type: type,
		summary: summary,
		sanitize: sanitize,
		sanitizeSerializable: sanitizeSerializable,
		normalize: normalize,
		snapshot: snapshot,
		mergedContext: mergedContext,
		contains: contains,
		assertSerializable: assertSerializable,
		create: create,
		close: close,
		closeAll: closeAll,
		value: value
	};
}())
