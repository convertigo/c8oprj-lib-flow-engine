// text.match, text.replace and text.split run a regular expression under an execution budget on the server
// (lib/text-pattern.js: TEXT_PATTERN_TIMEOUT), but in a page the browser runs its native RegExp, which nothing can stop
// (the comment of each *.browser.js says so). Their descriptions promised the budget everywhere (review of kit it36,
// 12/11): an agent could rely on TEXT_PATTERN_TIMEOUT for a pattern built from user input in a page.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../_flow/blocks/text');
let checks = 0;
for (const name of ['match', 'replace', 'split']) {
  const source = fs.readFileSync(path.join(dir, name + '.block.js'), 'utf8');
  const description = JSON.parse('"' + /"description": "((?:[^"\\]|\\.)*)"/.exec(source)[1] + '"');
  checks++;
  assert.match(description, /on the server/, name + ': the budget is said to be the one of the server: ' + description);
  checks++;
  assert.match(description, /in a page the browser runs its native RegExp without a budget/, name + ': the browser has none: ' + description);
  const browser = fs.readFileSync(path.join(dir, name + '.browser.js'), 'utf8');
  checks++;
  assert.match(browser, /a browser cannot stop its own RegExp/, name + ': the browser implementation has no budget');
}
console.log(JSON.stringify({ ok: true, checks }));
