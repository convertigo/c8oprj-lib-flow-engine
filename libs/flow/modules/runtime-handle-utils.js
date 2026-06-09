(function () {
	function jsValue(value, env) {
		if (value === undefined || value === null) {
			return value;
		}
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
		return value && value.__flowHandle === true;
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

	function sanitize(value, env, seen) {
		value = jsValue(value, env);
		if (isHandle(value)) {
			return summary(value);
		}
		if (value && Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(function (item) {
				return sanitize(item, env, seen);
			});
		}
		if (value && typeof value === "object") {
			seen = seen || [];
			if (seen.indexOf(value) !== -1) {
				return "[Circular]";
			}
			seen.push(value);
			var out = {};
			Object.keys(value).forEach(function (key) {
				out[key] = sanitize(value[key], env, seen);
			});
			seen.pop();
			return out;
		}
		return value;
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
			Object.keys(value).forEach(function (key) {
				if (!found) {
					found = contains(value[key], env, seen);
				}
			});
		}
		seen.pop();
		return found;
	}

	function assertSerializable(value, where, env) {
		if (contains(value, env)) {
			env.raise("RUNTIME_HANDLE_IN_RESULT", "Runtime handles cannot be written to " + where + ". Convert them to serializable data first.");
		}
	}

	function create(ctx, typeName, value, options) {
		options = options || {};
		ctx.handleSeq++;
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
		ctx.handles[id] = handle;
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
		Object.keys(ctx.handles || {}).forEach(function (id) {
			var handle = ctx.handles[id];
			if (handle && handle.__flowHandleClosed !== true) {
				close(ctx, handle, env);
			}
		});
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
		contains: contains,
		assertSerializable: assertSerializable,
		create: create,
		close: close,
		closeAll: closeAll,
		value: value
	};
}())
