(function () {
	function projectTypeDescriptorFile(name, env) {
		var dir = env.projectTypesDir();
		if (!dir) {
			env.raise("PROJECT_TYPES_UNAVAILABLE", "Project property types are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		return new env.File(dir, env.typeDescriptorFileName(name));
	}

	function validateDefinition(name, definition, env) {
		var type = env.normalizeTree(definition || {});
		if (type.version === undefined || type.version === null) {
			type.version = 1;
		}
		if (!type.name) {
			type.name = String(name || "");
		}
		if (!type.name) {
			env.raise("INVALID_TYPE", "Invalid property type descriptor: " + name,
				null, "A type descriptor must define a name.");
		}
		if (String(type.name) !== String(name)) {
			env.raise("TYPE_NAME_MISMATCH", "Type descriptor declares \"" + type.name + "\" instead of \"" + name + "\".");
		}
		return type;
	}

	function validateSource(name, source, env) {
		return validateDefinition(name, env.parseYamlSource(source, "version: 1\nname: " + String(name || "") + "\n"), env);
	}

	function sourceForWriteRequest(name, request, env) {
		request = request || {};
		var source = request.descriptorSource !== undefined ? request.descriptorSource : request.source;
		if (source !== undefined && source !== null && String(source).trim() !== "") {
			return String(source);
		}
		var definition = request.descriptor || request.definition;
		if (definition !== undefined && definition !== null) {
			var type = validateDefinition(name, definition, env);
			return env.toYamlSource(type);
		}
		env.raise("MISSING_TYPE_DESCRIPTOR", "Project property type \"" + name + "\" needs descriptorSource or descriptor.",
			null, "Define the type contract in libs/flow/types/" + env.typeDescriptorFileName(name) + ".");
	}

	return {
		projectTypeDescriptorFile: projectTypeDescriptorFile,
		validateDefinition: validateDefinition,
		validateSource: validateSource,
		sourceForWriteRequest: sourceForWriteRequest
	};
}())
