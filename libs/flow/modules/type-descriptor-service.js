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

	function createProjectType(types, name, request, overwrite, env) {
		var descriptorSource = sourceForWriteRequest(name, request, env);
		validateSource(name, descriptorSource, env);
		var file = projectTypeDescriptorFile(name, env);
		if (types[name] && types[name].__flowOrigin !== "project") {
			env.raise("DUPLICATE_TYPE", "Cannot override non-project Flow property type: " + name,
				null, "Choose a project-specific name instead.");
		}
		if (file.isFile() && overwrite !== true) {
			env.raise("TYPE_ALREADY_EXISTS", "Project property type already exists: " + name,
				null, "Pass overwrite=true to replace it explicitly.");
		}
		file.getParentFile().mkdirs();
		env.FileUtils.writeStringToFile(file, descriptorSource, "UTF-8");
		if (types[name]) {
			delete types[name];
		}
		var type = env.loadTypeDescriptorFile(types, file, "project");
		return env.typeDescriptor(type);
	}

	function getTypeSource(types, name, env) {
		var type = types[String(name || "")];
		if (!type) {
			env.raise("UNKNOWN_TYPE", "Unknown Flow property type: " + name);
		}
		var descriptorSource = String(env.FileUtils.readFileToString(new env.File(String(type.__flowFile)), "UTF-8"));
		return {
			name: type.name,
			origin: type.__flowOrigin || "unknown",
			file: String(type.__flowFile || ""),
			descriptorFile: String(type.__flowFile || ""),
			descriptor: env.typeDescriptor(type),
			descriptorSource: descriptorSource
		};
	}

	function typeList(blocks, env) {
		return {
			types: env.catalogTypes(Object.keys(blocks).sort().map(function (name) {
				return env.blockDescriptor(blocks[name]);
			}), env.loadTypes())
		};
	}

	return {
		projectTypeDescriptorFile: projectTypeDescriptorFile,
		validateDefinition: validateDefinition,
		validateSource: validateSource,
		sourceForWriteRequest: sourceForWriteRequest,
		createProjectType: createProjectType,
		getTypeSource: getTypeSource,
		typeList: typeList
	};
}())
