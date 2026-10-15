const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:email-fast-outline",
  "tags": [
    "email",
    "smtp",
    "notification",
    "account",
  ],
  "summary": "send email to {{to}}",
  "description": "Sends an email through the SMTP server of the platform: host, port, security, account and sender default to config.email.smtp, inherited from lib_flow_engine (symbols lib_flow_engine.smtp.*) and overridable by a project config. A text body, an HTML body or both (multipart/alternative), sent as given: render the HTML body with template.freemarker, which escapes the values a user typed. Returns { ok: true, messageId, recipients }; an unreachable server, refused credentials, an invalid address or a missing setting is a Flow error (EMAIL_SEND_FAILED, EMAIL_AUTHENTICATION_FAILED, EMAIL_ADDRESS_INVALID, EMAIL_CONFIGURATION_INVALID). For a test without a server, use email.mock.",
  "uses": [
    "email",
  ],
  "properties": {
    "to": {
      "label": "To",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Recipient addresses, separated by commas (Name <address> accepted).",
    },
    "subject": {
      "label": "Subject",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Subject of the email.",
    },
    "html": {
      "label": "HTML body",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "HTML body, usually rendered by template.freemarker from a .ftlh file of the project.",
    },
    "text": {
      "label": "Text body",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Plain text body, sent alone or as the alternative of the HTML body.",
    },
    "from": {
      "label": "From",
      "kind": "template",
      "type": "string",
      "default": "${config.email.smtp.from}",
      "description": "Sender address (Name <address> accepted). Read it from config.",
    },
    "host": {
      "label": "SMTP host",
      "kind": "template",
      "type": "string",
      "default": "${config.email.smtp.host}",
      "description": "SMTP server. Read it from config.",
    },
    "port": {
      "label": "SMTP port",
      "kind": "value",
      "type": "integer",
      "description": "Port of the server (config.email.smtp.port); empty takes the port of the security: 25 none, 587 starttls, 465 ssl.",
      "default": "${config.email.smtp.port}",
    },
    "security": {
      "label": "Security",
      "kind": "value",
      "type": "string",
      "enum": [
        "starttls",
        "ssl",
        "none",
      ],
      "default": "${config.email.smtp.security}",
      "description": "starttls upgrades the connection (required), ssl connects in TLS, none sends in clear.",
    },
    "user": {
      "label": "SMTP user",
      "kind": "template",
      "type": "string",
      "default": "${config.email.smtp.user}",
      "description": "Account of the server; empty sends without authentication. Read it from config.",
    },
    "password": {
      "label": "SMTP password",
      "kind": "template",
      "type": "string",
      "default": "${config.email.smtp.password}",
      "description": "Password of the account. Read it from config (a .secret symbol), never write it in the Flow.",
    },
    "replyTo": {
      "label": "Reply to",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Reply-to addresses, separated by commas.",
    },
    "cc": {
      "label": "Cc",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Copy addresses, separated by commas.",
    },
    "bcc": {
      "label": "Bcc",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Hidden copy addresses, separated by commas.",
    },
    "timeoutMs": {
      "label": "Timeout (ms)",
      "category": "Expert",
      "kind": "value",
      "type": "integer",
      "default": "${config.email.smtp.timeoutMs}",
      "description": "Connection, read and write timeout.",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
        },
        "messageId": {
          "type": "string",
        },
        "recipients": {
          "type": "integer",
        },
      },
    },
  },
  "runtime": "rhino",
}

(function () {
	function text(ctx, value) {
		var rendered = value === undefined || value === null ? "" : ctx.template(value);
		return rendered === undefined || rendered === null ? "" : String(rendered);
	}

	function value(ctx, raw) {
		return raw === undefined || raw === null || raw === "" ? undefined : ctx.input({ value: raw });
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			try {
				return ctx.lib("email").send({
					to: text(ctx, props.to),
					subject: text(ctx, props.subject),
					html: text(ctx, props.html),
					text: text(ctx, props.text),
					from: text(ctx, props.from),
					host: text(ctx, props.host),
					port: value(ctx, props.port),
					security: value(ctx, props.security),
					user: text(ctx, props.user),
					password: text(ctx, props.password),
					replyTo: text(ctx, props.replyTo),
					cc: text(ctx, props.cc),
					bcc: text(ctx, props.bcc),
					timeoutMs: value(ctx, props.timeoutMs)
				});
			} catch (e) {
				if (e && e.email) {
					return ctx.throwFlow({ code: e.code, message: e.message, status: e.status, details: e.details }, node);
				}
				throw e;
			}
		}
	};
}())
