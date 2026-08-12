const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function implementation(name) {
	const source = fs.readFileSync(path.join(
		__dirname,
		"../libs/flow/blocks/session",
		`${name}.block.js`
	), "utf8");
	return vm.runInNewContext(source.slice(source.indexOf("\n(function") + 1), {});
}

let authenticatedUser = null;
const convertigoContext = {
	setAuthenticatedUser(user) {
		authenticatedUser = String(user);
	},
	getAuthenticatedUser() {
		return authenticatedUser;
	},
	removeAuthenticatedUser() {
		authenticatedUser = null;
	},
};
const ctx = {
	props(node) {
		return node.props || {};
	},
	template(value) {
		return value;
	},
	convertigoContext() {
		return convertigoContext;
	},
};

const authenticate = implementation("authenticate");
const authenticated = implementation("authenticatedUser");

assert.strictEqual(authenticated.run(ctx), null);
assert.strictEqual(authenticate.run(ctx, { props: { user: " aaaa " } }), "aaaa");
assert.strictEqual(authenticated.run(ctx), "aaaa");
assert.strictEqual(authenticate.run(ctx, { props: { user: "" } }), null);
assert.strictEqual(authenticated.run(ctx), null);

console.log("authenticated session Flow blocks passed");
