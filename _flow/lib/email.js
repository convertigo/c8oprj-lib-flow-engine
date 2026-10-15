/*
 * SMTP sending of the email.send block, on the Jakarta Mail (javax.mail) of the engine.
 *
 * - transport security: none (plain, port 25), starttls (required, port 587) or ssl (implicit
 *   TLS, port 465), with TLS 1.2 / 1.3 only;
 * - authentication when a user is set (over any transport: a plain server is the deployer's
 *   choice, as with the SMTP step of the engine);
 * - the subject and bodies are sent as given: render an HTML body with template.freemarker, which escapes the values;
 * - connection, read and write timeouts always apply (30 s by default);
 * - addresses are validated (RFC 822 strict), the message carries both a text and an HTML part
 *   when both are given (multipart/alternative);
 * - a failure is an error ({ email: true, code, status }) the block turns into a Flow error:
 *   EMAIL_CONFIGURATION_INVALID (500), EMAIL_ADDRESS_INVALID (400), EMAIL_AUTHENTICATION_FAILED
 *   (500), EMAIL_SEND_FAILED (502).
 *
 * The Java dependent parts are isolated in javaPlatform().
 */
(function () {
	var DEFAULT_TIMEOUT_MS = 30000;
	var PORTS = { none: 25, starttls: 587, ssl: 465 };
	var SECURITIES = { none: true, starttls: true, ssl: true };

	function EmailError(code, message, status, details) {
		this.email = true;
		this.code = code;
		this.message = message;
		this.status = status;
		this.details = details;
	}

	function fail(code, message, status, details) {
		throw new EmailError(code, message, status, details);
	}

	function text(value) {
		return value === undefined || value === null ? "" : String(value);
	}

	function number(value, fallback) {
		if (value === undefined || value === null || value === "") {
			return fallback;
		}
		var parsed = Number(value);
		return isFinite(parsed) ? parsed : fallback;
	}

	function javaPlatform() {
		var Session = Packages.javax.mail.Session;
		var Transport = Packages.javax.mail.Transport;
		var RecipientType = Packages.javax.mail.Message.RecipientType;
		var MimeMessage = Packages.javax.mail.internet.MimeMessage;
		var MimeMultipart = Packages.javax.mail.internet.MimeMultipart;
		var MimeBodyPart = Packages.javax.mail.internet.MimeBodyPart;
		var InternetAddress = Packages.javax.mail.internet.InternetAddress;
		var Properties = Packages.java.util.Properties;

		// the MIME handlers of Jakarta Mail, registered by hand when the META-INF/mailcap of its jar
		// is not visible (merged jars, scripts outside the web application)
		try {
			var commandMap = Packages.javax.activation.CommandMap.getDefaultCommandMap();
			if (commandMap instanceof Packages.javax.activation.MailcapCommandMap) {
				commandMap.addMailcap("text/html;; x-java-content-handler=com.sun.mail.handlers.text_html");
				commandMap.addMailcap("text/plain;; x-java-content-handler=com.sun.mail.handlers.text_plain");
				commandMap.addMailcap("multipart/*;; x-java-content-handler=com.sun.mail.handlers.multipart_mixed; x-java-fallback-entry=true");
				commandMap.addMailcap("message/rfc822;; x-java-content-handler=com.sun.mail.handlers.message_rfc822");
			}
		} catch (e) {
		}

		function addresses(list, what) {
			if (list === "") {
				return null;
			}
			try {
				var parsed = InternetAddress.parse(list, true);
				for (var i = 0; i < parsed.length; i++) {
					parsed[i].validate();
				}
				return parsed;
			} catch (e) {
				fail("EMAIL_ADDRESS_INVALID", "Invalid " + what + " address: " + list, 400);
			}
		}

		function throwable(e) {
			if (e && e.javaException) {
				return e.javaException;
			}
			return e instanceof java.lang.Throwable ? e : null;
		}

		function classify(e) {
			var t = throwable(e);
			if (t === null) {
				throw e;
			}
			var root = t;
			while (root.getCause() != null && root.getCause() !== root) {
				root = root.getCause();
			}
			var message = String(t.getMessage() == null ? t : t.getMessage());
			var details = String(root.getClass().getName()) + (root.getMessage() == null ? "" : ": " + String(root.getMessage()));
			if (t instanceof Packages.javax.mail.AuthenticationFailedException) {
				fail("EMAIL_AUTHENTICATION_FAILED", "The SMTP server refused the credentials: " + message, 500, details);
			}
			if (t instanceof Packages.javax.mail.internet.AddressException) {
				fail("EMAIL_ADDRESS_INVALID", "Invalid address: " + message, 400, details);
			}
			fail("EMAIL_SEND_FAILED", "Cannot send the email: " + message, 502, details);
		}

		function send(request) {
			var props = new Properties();
			var smtps = request.security === "ssl";
			var prefix = smtps ? "mail.smtps." : "mail.smtp.";
			props.put(prefix + "host", request.host);
			props.put(prefix + "port", String(request.port));
			props.put(prefix + "connectiontimeout", String(request.timeoutMs));
			props.put(prefix + "timeout", String(request.timeoutMs));
			props.put(prefix + "writetimeout", String(request.timeoutMs));
			props.put(prefix + "auth", request.user ? "true" : "false");
			props.put(prefix + "ssl.protocols", "TLSv1.2 TLSv1.3");
			if (request.security === "starttls") {
				props.put("mail.smtp.starttls.enable", "true");
				props.put("mail.smtp.starttls.required", "true");
			}
			var session = Session.getInstance(props);
			var message = new MimeMessage(session);
			message.setFrom(addresses(request.from, "sender")[0]);
			message.setRecipients(RecipientType.TO, addresses(request.to, "recipient"));
			if (request.cc) {
				message.setRecipients(RecipientType.CC, addresses(request.cc, "cc"));
			}
			if (request.bcc) {
				message.setRecipients(RecipientType.BCC, addresses(request.bcc, "bcc"));
			}
			if (request.replyTo) {
				message.setReplyTo(addresses(request.replyTo, "reply-to"));
			}
			message.setSubject(request.subject, "UTF-8");
			if (request.html && request.text) {
				var alternative = new MimeMultipart("alternative");
				var textPart = new MimeBodyPart();
				textPart.setText(request.text, "UTF-8");
				alternative.addBodyPart(textPart);
				var htmlPart = new MimeBodyPart();
				htmlPart.setContent(request.html, "text/html; charset=UTF-8");
				alternative.addBodyPart(htmlPart);
				message.setContent(alternative);
			} else if (request.html) {
				message.setContent(request.html, "text/html; charset=UTF-8");
			} else {
				message.setText(request.text, "UTF-8");
			}
			message.setSentDate(new java.util.Date());
			message.saveChanges();
			var transport = session.getTransport(smtps ? "smtps" : "smtp");
			try {
				if (request.user) {
					transport.connect(request.host, request.port, request.user, request.password);
				} else {
					transport.connect(request.host, request.port, null, null);
				}
				transport.sendMessage(message, message.getAllRecipients());
			} finally {
				try {
					transport.close();
				} catch (e) {
				}
			}
			return {
				ok: true,
				messageId: String(message.getMessageID() == null ? "" : message.getMessageID()),
				recipients: message.getAllRecipients().length
			};
		}

		return {
			send: function (request) {
				try {
					return send(request);
				} catch (e) {
					if (e && e.email) {
						throw e;
					}
					return classify(e);
				}
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

	// options: host, port, security (none | starttls | ssl), user, password, timeoutMs, from,
	// to, cc, bcc, replyTo, subject, text, html
	api.send = function (options) {
		options = options || {};
		var host = text(options.host).trim();
		if (host === "") {
			fail("EMAIL_CONFIGURATION_INVALID", "The SMTP host is required (read it from config)", 500);
		}
		var security = text(options.security || "starttls").toLowerCase();
		if (!SECURITIES[security]) {
			fail("EMAIL_CONFIGURATION_INVALID", "security is none, starttls or ssl: " + security, 500);
		}
		var port = Math.floor(number(options.port, PORTS[security]));
		if (!(port > 0 && port < 65536)) {
			fail("EMAIL_CONFIGURATION_INVALID", "The SMTP port is invalid: " + options.port, 500);
		}
		var user = text(options.user).trim();
		var password = text(options.password);
		if (user !== "" && password === "") {
			fail("EMAIL_CONFIGURATION_INVALID", "The SMTP password of " + user + " is empty (read it from config)", 500);
		}
		var from = text(options.from).trim();
		if (from === "") {
			fail("EMAIL_CONFIGURATION_INVALID", "The sender address is required (read it from config)", 500);
		}
		var to = text(options.to).trim();
		if (to === "") {
			fail("EMAIL_ADDRESS_INVALID", "The recipient is empty", 400);
		}
		var html = text(options.html);
		var plain = text(options.text);
		if (html === "" && plain === "") {
			fail("EMAIL_CONFIGURATION_INVALID", "The email has no text and no HTML body", 400);
		}
		return platform().send({
			host: host,
			port: port,
			security: security,
			user: user,
			password: password,
			timeoutMs: Math.max(1000, number(options.timeoutMs, DEFAULT_TIMEOUT_MS)),
			from: from,
			to: to,
			cc: text(options.cc).trim(),
			bcc: text(options.bcc).trim(),
			replyTo: text(options.replyTo).trim(),
			subject: text(options.subject),
			text: plain,
			html: html
		});
	};

	return api;
}())
