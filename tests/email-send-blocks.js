// email.send against a minimal SMTP server served by this test (127.0.0.1, plain, AUTH PLAIN
// and LOGIN): text and HTML bodies, escaped placeholders, recipients, authentication and the
// errors of an unreachable or misconfigured server.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-email-test").getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

// ---- the SMTP server ----------------------------------------------------------------------
var messages = [];
var server = { user: "mailer", password: "mail-secret" };

function decodeBase64(text) {
	return String(new java.lang.String(java.util.Base64.getDecoder().decode(String(text).trim()), "UTF-8"));
}

function serve(socket) {
	var input = new java.io.BufferedReader(new java.io.InputStreamReader(socket.getInputStream(), "UTF-8"));
	var output = new java.io.PrintWriter(new java.io.OutputStreamWriter(socket.getOutputStream(), "UTF-8"), true);
	function reply(text) {
		output.print(text + "\r\n");
		output.flush();
	}
	var message = { from: "", recipients: [], data: "", authenticated: false };
	try {
		reply("220 test.local ESMTP");
		var line;
		var loginUser = null;
		while ((line = input.readLine()) != null) {
			line = String(line);
			var upper = line.toUpperCase();
			if (upper.indexOf("EHLO") === 0) {
				output.print("250-test.local\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
				output.flush();
			} else if (upper.indexOf("HELO") === 0) {
				reply("250 test.local");
			} else if (upper.indexOf("AUTH PLAIN") === 0) {
				var plain = decodeBase64(line.substring(10));
				var parts = plain.split("\u0000");
				message.authenticated = parts.length === 3 && parts[1] === server.user && parts[2] === server.password;
				reply(message.authenticated ? "235 ok" : "535 authentication failed");
			} else if (upper.indexOf("AUTH LOGIN") === 0) {
				reply("334 VXNlcm5hbWU6");
				loginUser = decodeBase64(String(input.readLine()));
				reply("334 UGFzc3dvcmQ6");
				var loginPassword = decodeBase64(String(input.readLine()));
				message.authenticated = loginUser === server.user && loginPassword === server.password;
				reply(message.authenticated ? "235 ok" : "535 authentication failed");
			} else if (upper.indexOf("MAIL FROM:") === 0) {
				message.from = line.substring(10).trim();
				reply("250 ok");
			} else if (upper.indexOf("RCPT TO:") === 0) {
				message.recipients.push(line.substring(8).trim());
				reply("250 ok");
			} else if (upper === "DATA") {
				reply("354 end with <CRLF>.<CRLF>");
				var data = [];
				while ((line = input.readLine()) != null && String(line) !== ".") {
					data.push(String(line));
				}
				message.data = data.join("\n");
				messages.push(message);
				message = { from: "", recipients: [], data: "", authenticated: message.authenticated };
				reply("250 queued");
			} else if (upper === "QUIT") {
				reply("221 bye");
				break;
			} else if (upper === "RSET" || upper === "NOOP") {
				reply("250 ok");
			} else {
				reply("500 unknown command");
			}
		}
	} catch (e) {
	} finally {
		try {
			socket.close();
		} catch (e) {
		}
	}
}

var listener = new java.net.ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"));
var port = listener.getLocalPort();
function spawn(socket) {
	var worker = new java.lang.Thread(function () { serve(socket); });
	worker.setDaemon(true);
	worker.start();
}
var acceptor = new java.lang.Thread(function () {
	while (true) {
		try {
			spawn(listener.accept());
		} catch (e) {
			break;
		}
	}
});
acceptor.setDaemon(true);
acceptor.start();
var closed = new java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"));
var closedPort = closed.getLocalPort();
closed.close();

// ---- the tests ------------------------------------------------------------------------------
function run(nodes, input) {
	return JSON.parse(engine.run(JSON.stringify({ definition: { version: 1, nodes: nodes }, input: input || {}, includeTrace: false })));
}

function one(block, props) {
	var out = run([{ id: "it", block: block, props: props, out: "result.it" }]);
	assertTrue(out.ok === true, block + " failed: " + JSON.stringify(out).substring(0, 1500));
	return out.result.it;
}

function error(block, props) {
	var out = run([{ id: "it", block: block, props: props, out: "result.it" }]);
	assertTrue(out.ok === false && out.error, block + " should fail: " + JSON.stringify(out).substring(0, 1500));
	return out.error;
}

var smtp = { host: "127.0.0.1", port: port, security: "none", from: "Flow <flow@example.org>" };
function send(props) {
	var merged = {};
	for (var key in smtp) {
		merged[key] = smtp[key];
	}
	for (var name in props) {
		merged[name] = props[name];
	}
	return merged;
}

try {
	// a text and HTML email with escaped placeholders
	var sent = one("email.send", send({
		to: "Ada <ada@example.org>, alan@example.org",
		cc: "grace@example.org",
		subject: "Welcome {name}",
		text: "Hello {name}, confirm at {url}",
		html: "<p>Hello <b>{name}</b>, <a href=\"{url}\">confirm</a></p>",
		values: { name: "Ada <script>", url: "https://app.example.org/confirm?key=a&b" }
	}));
	assertTrue(sent.ok === true && sent.recipients === 3 && /^<.+>$/.test(sent.messageId), "sent to three recipients: " + JSON.stringify(sent));
	assertTrue(messages.length === 1, "one message received: " + messages.length);
	var received = messages[0];
	assertTrue(received.from === "<flow@example.org>" && received.recipients.join(",") === "<ada@example.org>,<alan@example.org>,<grace@example.org>",
		"sender and recipients: " + JSON.stringify(received));
	assertTrue(received.authenticated === false, "no authentication without a user");
	assertTrue(/multipart\/alternative/.test(received.data) && /text\/plain/.test(received.data) && /text\/html/.test(received.data), "text and HTML parts: " + received.data.substring(0, 800));
	assertTrue(received.data.indexOf("Hello Ada <script>, confirm at https://app.example.org/confirm?key=a&b") >= 0, "raw values in the text part");
	assertTrue(received.data.indexOf("Hello <b>Ada &lt;script&gt;</b>") >= 0 && received.data.indexOf("href=\"https://app.example.org/confirm?key=a&amp;b\"") >= 0, "escaped values in the HTML part: " + received.data);
	assertTrue(received.data.indexOf("Subject: Welcome Ada <script>") >= 0, "subject placeholder");
	assertTrue(received.data.indexOf("Cc: grace@example.org") >= 0 && received.data.indexOf("To: Ada <ada@example.org>, alan@example.org") >= 0, "headers: " + received.data.substring(0, 600));

	// authentication
	var authenticated = one("email.send", send({ to: "ada@example.org", subject: "Hi", text: "Hi", user: server.user, password: server.password }));
	assertTrue(authenticated.ok === true && messages[1].authenticated === true, "AUTH PLAIN with the configured account");
	var refused = error("email.send", send({ to: "ada@example.org", subject: "Hi", text: "Hi", user: server.user, password: "wrong" }));
	assertTrue(refused.code === "EMAIL_AUTHENTICATION_FAILED" && refused.status === 500, "refused credentials: " + JSON.stringify(refused));
	assertTrue(messages.length === 2, "nothing sent with refused credentials");

	// HTML only, text only
	var htmlOnly = one("email.send", send({ to: "ada@example.org", subject: "Hi", html: "<p>Only HTML</p>" }));
	assertTrue(htmlOnly.ok === true && /Content-Type: text\/html/.test(messages[2].data) && !/multipart/.test(messages[2].data), "HTML only: " + messages[2].data.substring(0, 400));
	var textOnly = one("email.send", send({ to: "ada@example.org", subject: "Hi", text: "Only text" }));
	assertTrue(textOnly.ok === true && /Content-Type: text\/plain/.test(messages[3].data) && !/multipart/.test(messages[3].data), "text only");
	var utf8 = one("email.send", send({ to: "ada@example.org", subject: "Café {name}", text: "Été", values: { name: "Élodie" } }));
	assertTrue(utf8.ok === true && /Subject: =\?UTF-8\?/.test(messages[4].data), "UTF-8 subject encoded: " + messages[4].data.substring(0, 400));

	// errors
	assertTrue(error("email.send", send({ to: "ada@example.org", subject: "Hi", text: "Hi", host: "" })).code === "EMAIL_CONFIGURATION_INVALID", "host required");
	assertTrue(error("email.send", send({ to: "ada@example.org", subject: "Hi", text: "Hi", from: "" })).code === "EMAIL_CONFIGURATION_INVALID", "sender required");
	assertTrue(error("email.send", send({ to: "ada@example.org", subject: "Hi" })).code === "EMAIL_CONFIGURATION_INVALID", "a body is required");
	assertTrue(error("email.send", send({ to: "ada@example.org", subject: "Hi", text: "Hi", user: "u", password: "" })).code === "EMAIL_CONFIGURATION_INVALID", "a user needs a password");
	assertTrue(error("email.send", send({ to: "", subject: "Hi", text: "Hi" })).code === "EMAIL_ADDRESS_INVALID", "recipient required");
	assertTrue(error("email.send", send({ to: "not an address", subject: "Hi", text: "Hi" })).code === "EMAIL_ADDRESS_INVALID", "recipient validated");
	assertTrue(error("email.send", send({ to: "ada@example.org", subject: "Hi", text: "Hi {name}" })).code === "EMAIL_VALUE_MISSING", "placeholders need values");
	var unreachable = error("email.send", send({ to: "ada@example.org", subject: "Hi", text: "Hi", port: closedPort, timeoutMs: 2000 }));
	assertTrue(unreachable.code === "EMAIL_SEND_FAILED" && unreachable.status === 502, "unreachable server: " + JSON.stringify(unreachable));
	assertTrue(messages.length === 5, "five messages in all: " + messages.length);

	var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "email", detail: "full" })));
	var block = catalog.blocks.filter(function (item) { return item.blockId === "email.send"; })[0];
	assertTrue(block && block.props.values.kind === "value" && block.props.security.kind === "value" && block.outputs.out.properties.ok.type === "boolean", "catalog exposes email.send");
	print("email.send: ok (" + messages.length + " messages received)");
} finally {
	listener.close();
}
