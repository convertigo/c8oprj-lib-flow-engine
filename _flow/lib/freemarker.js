/*
 * FreeMarker rendering of the template.freemarker block, with the FreeMarker of the Convertigo engine, locked down:
 *
 * - templates come from the project resources (_flow/resources/...), or from an inline text; an #include or #import
 *   resolves inside _flow/resources only; with a locale, welcome.ftlh is looked up as welcome_fr_FR.ftlh, then
 *   welcome_fr.ftlh, then welcome.ftlh (FreeMarker localized lookup);
 * - the values are plain data (objects, arrays, texts, numbers, booleans) converted to Java collections and wrapped
 *   by the SimpleObjectWrapper: no Java object, no ?api, no ?new class instantiation reaches a template;
 * - a .ftlh template (or an inline one in html format) escapes every ${value} for HTML; .ftlx for XML; .ftl is
 *   plain text;
 * - numbers are rendered as written (number_format "computer", no locale grouping), an undefined value is an error
 *   (FreeMarker's ${value!"default"} gives an explicit default);
 * - a template error is an error ({ freemarker: true, code, message, status }) the block turns into a Flow error.
 *
 * The Java dependent parts are isolated in javaPlatform().
 */
(function () {
	var RESOURCES = "_flow/resources/";

	function TemplateError(code, message, status) {
		this.freemarker = true;
		this.code = code;
		this.message = message;
		this.status = status;
	}

	function fail(code, message, status) {
		throw new TemplateError(code, message, status || 500);
	}

	function text(value) {
		return value === undefined || value === null ? "" : String(value);
	}

	function javaPlatform() {
		var Configuration = Packages.freemarker.template.Configuration;
		var version = Configuration.VERSION_2_3_34;
		var configurations = {};

		function configuration(resourcesDir) {
			var key = resourcesDir ? String(resourcesDir.getCanonicalPath()) : "";
			if (configurations[key]) {
				return configurations[key];
			}
			var cfg = new Configuration(version);
			cfg.setDefaultEncoding("UTF-8");
			cfg.setOutputEncoding("UTF-8");
			cfg.setRecognizeStandardFileExtensions(true);
			cfg.setNumberFormat("computer");
			cfg.setLocale(java.util.Locale.ROOT);
			cfg.setTemplateExceptionHandler(Packages.freemarker.template.TemplateExceptionHandler.RETHROW_HANDLER);
			cfg.setLogTemplateExceptions(false);
			cfg.setWrapUncheckedExceptions(true);
			cfg.setFallbackOnNullLoopVariable(false);
			cfg.setAPIBuiltinEnabled(false);
			cfg.setNewBuiltinClassResolver(Packages.freemarker.core.TemplateClassResolver.ALLOWS_NOTHING_RESOLVER);
			cfg.setObjectWrapper(new Packages.freemarker.template.SimpleObjectWrapper(version));
			cfg.setTemplateUpdateDelayMilliseconds(0);
			if (resourcesDir) {
				// FileTemplateLoader refuses a path that leaves its base directory, links included
				cfg.setTemplateLoader(new Packages.freemarker.cache.FileTemplateLoader(resourcesDir));
			} else {
				cfg.setTemplateLoader(new Packages.freemarker.cache.StringTemplateLoader());
			}
			configurations[key] = cfg;
			return cfg;
		}

		function javaValue(value) {
			if (value === undefined || value === null) {
				return null;
			}
			if (Array.isArray(value)) {
				var list = new java.util.ArrayList();
				value.forEach(function (item) { list.add(javaValue(item)); });
				return list;
			}
			if (typeof value === "object") {
				var map = new java.util.LinkedHashMap();
				Object.keys(value).forEach(function (key) {
					var converted = javaValue(value[key]);
					if (converted !== null) {
						map.put(String(key), converted);
					}
				});
				return map;
			}
			if (typeof value === "number") {
				return Math.floor(value) === value && Math.abs(value) < 9007199254740992
					? java.lang.Long.valueOf(value) : java.lang.Double.valueOf(value);
			}
			if (typeof value === "boolean") {
				return java.lang.Boolean.valueOf(value);
			}
			return new java.lang.String(String(value));
		}

		function describe(e) {
			var t = e && e.javaException ? e.javaException : e;
			if (t instanceof Packages.freemarker.template.TemplateNotFoundException) {
				fail("FREEMARKER_TEMPLATE_NOT_FOUND", "Template not found: " + String(t.getTemplateName()), 500);
			}
			if (t instanceof Packages.freemarker.core.ParseException) {
				fail("FREEMARKER_TEMPLATE_INVALID", "Invalid template, line " + t.getLineNumber() + ", column " + t.getColumnNumber() + ": " + String(t.getEditorMessage()), 500);
			}
			if (t instanceof Packages.freemarker.template.TemplateException) {
				fail("FREEMARKER_TEMPLATE_ERROR", "Template error" + (t.getLineNumber() ? ", line " + t.getLineNumber() : "") + ": " + String(t.getMessageWithoutStackTop()), 500);
			}
			throw e;
		}

		function render(template, values) {
			var out = new java.io.StringWriter();
			try {
				template.process(javaValue(values || {}), out);
			} catch (e) {
				describe(e);
			}
			return String(out.toString());
		}

		return {
			renderFile: function (resourcesDir, name, values, locale) {
				var template;
				try {
					template = locale
						? configuration(resourcesDir).getTemplate(name, java.util.Locale.forLanguageTag(String(locale).replace(/_/g, "-")))
						: configuration(resourcesDir).getTemplate(name);
				} catch (e) {
					describe(e);
				}
				return render(template, values);
			},
			renderText: function (source, format, values) {
				var name = format === "plain" ? "inline.ftl" : format === "xml" ? "inline.ftlx" : "inline.ftlh";
				var template;
				try {
					template = new Packages.freemarker.template.Template(name, new java.io.StringReader(source), configuration(null));
				} catch (e) {
					describe(e);
				}
				return render(template, values);
			}
		};
	}

	var localPlatform = null;

	function platform() {
		if (localPlatform === null) {
			localPlatform = javaPlatform();
		}
		return localPlatform;
	}

	var api = {};

	// options: projectDir, file (a path under _flow/resources/) with an optional locale (fr, fr-FR...), or template
	// (inline text) with format (html, xml or plain), values (plain data)
	api.render = function (options) {
		options = options || {};
		var file = text(options.file).trim().replace(/\\/g, "/");
		if (file !== "") {
			if (file.indexOf(RESOURCES) !== 0 || /(^|\/)\.\.(\/|$)/.test(file)) {
				fail("FREEMARKER_TEMPLATE_PATH_INVALID", "A template file is a path under " + RESOURCES + ", for example " + RESOURCES + "emails/welcome_fr.ftlh: " + file, 400);
			}
			if (!/\.ftl[hx]?$/.test(file)) {
				fail("FREEMARKER_TEMPLATE_PATH_INVALID", "A template file ends with .ftlh (HTML), .ftlx (XML) or .ftl (text): " + file, 400);
			}
			if (!options.projectDir) {
				fail("FREEMARKER_PROJECT_UNAVAILABLE", "The project of the Flow is unknown: template files need a running project", 500);
			}
			var resourcesDir = new java.io.File(options.projectDir, RESOURCES);
			var locale = text(options.locale).trim();
			if (locale !== "" && !/^[A-Za-z]{2,8}([_-][A-Za-z0-9]{1,8})*$/.test(locale)) {
				fail("FREEMARKER_LOCALE_INVALID", "A locale is a language tag such as fr or fr-FR: " + locale, 400);
			}
			return platform().renderFile(resourcesDir, file.substring(RESOURCES.length), options.values, locale);
		}
		var source = text(options.template);
		if (source === "") {
			fail("FREEMARKER_TEMPLATE_REQUIRED", "Give a template file (under " + RESOURCES + ") or an inline template", 400);
		}
		var format = text(options.format || "html").toLowerCase();
		if (format !== "html" && format !== "xml" && format !== "plain") {
			fail("FREEMARKER_FORMAT_INVALID", "format is html, xml or plain: " + format, 400);
		}
		return platform().renderText(source, format, options.values);
	};

	return api;
}())
