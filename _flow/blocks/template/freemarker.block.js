const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:text-box-edit-outline",
  "tags": [
    "template",
    "freemarker",
    "email",
    "html",
  ],
  "summary": [
    "render {{file}}",
    "render template",
  ],
  "description": "Renders a FreeMarker template with values: a file of the project under _flow/resources/ (welcome.ftlh, with welcome_fr.ftlh for the fr locale), or an inline template. In a .ftlh file (or an inline template in html format) every ${value} is escaped for HTML, so a name or a link a user typed cannot inject markup; .ftlx escapes for XML, .ftl is plain text. The values are plain data passed in Values ({ name: input.name, confirmUrl: local.url }): the template reaches no Java object. An undefined value is an error; write ${value!\"\"} for an optional one. Use it for email bodies (with email.send), documents or any generated text.",
  "properties": {
    "file": {
      "label": "Template file",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Path of the template in the project, under _flow/resources/, for example _flow/resources/emails/welcome.ftlh. #include and #import resolve inside _flow/resources/.",
    },
    "locale": {
      "label": "Language",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Language of the email or document, such as fr or fr-FR: welcome.ftlh is then looked up as welcome_fr_FR.ftlh, welcome_fr.ftlh, then welcome.ftlh. Empty takes welcome.ftlh.",
    },
    "values": {
      "label": "Values",
      "kind": "value",
      "type": "object",
      "description": "Data the template reads, for example { appName: config.appName, confirmUrl: local.url }.",
    },
    "template": {
      "label": "Inline template",
      "category": "Expert",
      "kind": "text",
      "type": "string",
      "default": "",
      "description": "FreeMarker text used when there is no template file, for example <p>Hello ${name}</p>; write it as a plain string, its ${...} are FreeMarker's.",
    },
    "format": {
      "label": "Inline format",
      "category": "Expert",
      "kind": "literal",
      "type": "string",
      "enum": [
        "html",
        "xml",
        "plain",
      ],
      "default": "html",
      "description": "Escaping of an inline template: html, xml or plain (none). A template file takes it from its extension.",
    },
  },
  "outputs": {
    "out": {
      "type": "string",
    },
  },
  "uses": [
    "freemarker",
  ],
  "runtime": "rhino",
}

(function () {
	function text(ctx, raw) {
		var rendered = raw === undefined || raw === null ? "" : ctx.template(raw);
		return rendered === undefined || rendered === null ? "" : String(rendered);
	}

	function value(ctx, raw) {
		return raw === undefined || raw === null || raw === "" ? undefined : ctx.input({ value: raw });
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			try {
				return ctx.lib("freemarker").render({
					projectDir: ctx.read("request.projectDir"),
					file: text(ctx, props.file),
					locale: text(ctx, props.locale),
					template: props.template,
					format: props.format,
					values: value(ctx, props.values)
				});
			} catch (e) {
				if (e && e.freemarker) {
					return ctx.throwFlow({ code: e.code, message: e.message, status: e.status }, node);
				}
				throw e;
			}
		}
	};
}())
