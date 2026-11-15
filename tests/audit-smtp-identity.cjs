const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('_flow/lib/email.js', 'utf8');
const setup = source.slice(source.indexOf('var props = new Properties();'), source.indexOf('var session = Session.getInstance(props);'));
for (const security of ['starttls', 'ssl', 'none']) {
  const values = {};
  vm.runInNewContext(setup, {request: {security, host: 'mail.example.org', port: 465, timeoutMs: 1000}, Properties: function () {this.put = (k,v) => { values[k] = v; };}});
  const prefix = security === 'ssl' ? 'mail.smtps.' : 'mail.smtp.';
  assert.equal(values[prefix + 'ssl.checkserveridentity'], 'true');
  assert.equal(values[prefix + 'ssl.trust'], undefined);
  if (security === 'starttls') assert.equal(values['mail.smtp.starttls.required'], 'true');
}
console.log('audit-smtp-identity OK');
