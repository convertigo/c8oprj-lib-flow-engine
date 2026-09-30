#!/bin/bash
# Runs every lib_flow_engine test with the runtime it needs:
# - Rhino tests (java.* / arguments) through the Convertigo dependencies jar;
# - Node tests (require) with jsdom from the Svelte frontbuilder.
#
# Usage: tools/run-tests.sh [test-name-filter]
# Environment (defaults assume sibling checkouts of convertigo and the frontbuilder):
#   CONVERTIGO_DEPENDENCIES_JAR  Convertigo engine/build/libs/dependencies-*.jar
#   FLOW_FRONTBUILDER_RESOURCE_ROOT  c8oprj-lib-flow-frontbuilder-svelte/_flow/frontbuilder/svelte
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GIT="$(dirname "$ROOT")"
JAR="${CONVERTIGO_DEPENDENCIES_JAR:-$(ls "$GIT"/convertigo/engine/build/libs/dependencies-*.jar 2>/dev/null | grep -v sources | head -1)}"
PROVIDER="${FLOW_FRONTBUILDER_RESOURCE_ROOT:-$GIT/c8oprj-lib-flow-frontbuilder-svelte/_flow/frontbuilder/svelte}"
FILTER="${1:-}"
export FLOW_ENGINE_RESOURCE_ROOT="$ROOT/_flow" FLOW_FRONTBUILDER_RESOURCE_ROOT="$PROVIDER" FLOW_SVELTE_PROVIDER_ROOT="$PROVIDER"
[ -f "$JAR" ] || { echo "Convertigo dependencies jar not found; set CONVERTIGO_DEPENDENCIES_JAR" >&2; exit 2; }
LOGS="$(mktemp -d "${TMPDIR:-/tmp}/lib-flow-engine-tests.XXXXXX")"
# Headless: a test that renders icons starts AWT, whose AWT-Shutdown thread otherwise keeps
# the JVM alive on macOS for minutes after the script ends
JAVA_FLAGS=(-Djava.awt.headless=true)
cd "$ROOT"
pass=0; fail=0
for f in tests/*.js tests/*.cjs; do
	name="$(basename "$f")"
	[ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]] && continue
	if grep -q "require(" "$f"; then
		if [ "$name" = frontend-provider-integration.js ]; then cmd=(node "$f"); else cmd=(node "$f" "$PROVIDER/node_modules/jsdom"); fi
	elif [ "$name" = source-creation-contract.js ]; then
		cmd=(java "${JAVA_FLAGS[@]}" -cp "$JAR" org.mozilla.javascript.tools.shell.Main -version 200 "$f" "$ROOT/_flow" "$PROVIDER")
	else
		cmd=(java "${JAVA_FLAGS[@]}" -cp "$JAR" org.mozilla.javascript.tools.shell.Main -version 200 "$f" "$ROOT/_flow")
	fi
	log="$LOGS/$name.log"
	perl -e 'alarm 400; exec @ARGV' "${cmd[@]}" > "$log" 2>&1
	code=$?
	if [ $code -eq 0 ] && ! grep -qi "^\(js: \)\?\(uncaught\|exception\|error:\)" "$log"; then
		pass=$((pass + 1)); echo "PASS $name"
	else
		fail=$((fail + 1)); echo "FAIL $name ($log)"
	fi
done
echo "$pass passed, $fail failed"
[ $fail -eq 0 ]
