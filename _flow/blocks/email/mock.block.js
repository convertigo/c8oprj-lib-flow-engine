const _meta = {
  "sourceVersion": 2,
  "version": 2,
  "icon": "mdi:email-outline",
  "tags": [
    "email",
    "smtp",
    "notification",
    "test",
  ],
  "summary": "mock email to {{to}}",
  "description": "Checks an email as email.send does and sends nothing: the same properties (the settings of the SMTP server are accepted and not needed) and the same result { ok: true, messageId, recipients }, with mock: true and the message (from, to, cc, bcc, replyTo, subject, text, html), so that a Flow switches from one to the other by its block name. A missing recipient or body, or an invalid address, is the Flow error of email.send (EMAIL_ADDRESS_INVALID, EMAIL_CONFIGURATION_INVALID). body is the deprecated name of text.",
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
    "body": {
      "label": "Body (deprecated)",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "default": "",
      "hidden": true,
      "description": "Deprecated: the text body, as text.",
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
        "mock": {
          "type": "boolean",
        },
        "from": {
          "type": "string",
        },
        "to": {
          "type": "string",
        },
        "cc": {
          "type": "string",
        },
        "bcc": {
          "type": "string",
        },
        "replyTo": {
          "type": "string",
        },
        "subject": {
          "type": "string",
        },
        "text": {
          "type": "string",
        },
        "html": {
          "type": "string",
        },
      },
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "mock.hooks.js",
  },
}

(function () {
	function text(ctx, value) {
		var rendered = value === undefined || value === null ? "" : ctx.template(value);
		return rendered === undefined || rendered === null ? "" : String(rendered);
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var plain = text(ctx, props.text);
			try {
				var out = ctx.lib("email").preview({
					to: text(ctx, props.to),
					subject: text(ctx, props.subject),
					html: text(ctx, props.html),
					text: plain !== "" ? plain : text(ctx, props.body),
					from: text(ctx, props.from),
					replyTo: text(ctx, props.replyTo),
					cc: text(ctx, props.cc),
					bcc: text(ctx, props.bcc)
				});
				// the result of the first email.mock, kept for the Flows that read it
				out.sent = true;
				out.body = out.text;
				return out;
			} catch (e) {
				if (e && e.email) {
					return ctx.throwFlow({ code: e.code, message: e.message, status: e.status, details: e.details }, node);
				}
				throw e;
			}
		},
		debug: {
			resolve: function (ctx, node) {
				var props = ctx.props(node);
				var plain = text(ctx, props.text);
				try {
					var receiver = ctx.lib("email"),
						method = receiver.preview;
					var capturedArguments = {
						to: text(ctx, props.to),
						subject: text(ctx, props.subject),
						html: text(ctx, props.html),
						text: plain !== "" ? plain : text(ctx, props.body),
						from: text(ctx, props.from),
						replyTo: text(ctx, props.replyTo),
						cc: text(ctx, props.cc),
						bcc: text(ctx, props.bcc)
					};
					Object.defineProperties(capturedArguments, {
						__receiver: { value: receiver },
						__method: { value: method }
					});
					return capturedArguments;
				} catch (e) {
					if (e && e.email) {
						return ctx.throwFlow(
							{ code: e.code, message: e.message, status: e.status, details: e.details },
							node
						);
					}
					throw e;
				}
			},
			run: function (ctx, node, args) {
				try {
					var out = args.__method.call(args.__receiver, args);
					out.sent = true;
					out.body = out.text;
					return out;
				} catch (e) {
					if (e && e.email) {
						return ctx.throwFlow(
							{ code: e.code, message: e.message, status: e.status, details: e.details },
							node
						);
					}
					throw e;
				}
			}
		}
	};
}())
