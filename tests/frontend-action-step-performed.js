var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));

function assertTrue(value, message) {
  if (!value) {
    throw new Error(message);
  }
}
var start = source.indexOf("function frontendActionStepPerformed(response, action)");
var end = source.indexOf("\n\tfunction frontendProjectName", start);
assertTrue(start >= 0 && end > start, "frontendActionStepPerformed must remain extractable");
var implementation = source.substring(start, end).trim();
var frontendActionStepPerformed = eval("(" + implementation + ")");

assertTrue(frontendActionStepPerformed({
  details: { steps: [{ action: "installApp", ok: true, skipped: false }] }
}, "installApp"), "a successful non-skipped install must be reported");

assertTrue(!frontendActionStepPerformed({
  details: { steps: [{ action: "installApp", ok: true, skipped: true }] }
}, "installApp"), "a reusable install must not trigger a restart");

assertTrue(!frontendActionStepPerformed({
  details: { steps: [{ action: "installApp", ok: false, skipped: false }] }
}, "installApp"), "a failed install must not be reported as performed");

assertTrue(!frontendActionStepPerformed({}, "installApp"),
  "a response without steps must be handled");

print("frontend-action-step-performed OK");
