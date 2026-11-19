#!/usr/bin/env bash
# Accessibility of the Flows of a project: a report by default, exiting with 1 when a Flow declares none (a library can
# run it in its suite as a check); accessibility: "public" written in the _flow header of these Flows with --write.
# Usage: bash tools/declare-flow-accessibility.sh <project dir> [--write]
# Classpath: CONVERTIGO_TEST_CLASSPATH, or the engine and dependencies jars of $CONVERTIGO_ROOT (default ../convertigo),
# followed by the classes of libs/build.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
project=${1:?Usage: bash tools/declare-flow-accessibility.sh <project dir> [--write]}
shift
classpath=${CONVERTIGO_TEST_CLASSPATH:-}
if [ -z "$classpath" ]; then
  libs="${CONVERTIGO_ROOT:-$root/../convertigo}/engine/build/libs"
  engine=$(ls "$libs"/convertigo-engine-*.jar 2>/dev/null | head -n 1 || true)
  dependencies=$(ls "$libs"/dependencies-*.jar 2>/dev/null | grep -v -- '-sources-' | head -n 1 || true)
  [ -n "$engine" ] && [ -n "$dependencies" ] || { echo "Missing Convertigo jars in $libs; set CONVERTIGO_ROOT or CONVERTIGO_TEST_CLASSPATH." >&2; exit 2; }
  classpath="$engine:$dependencies:$libs/*"
fi
# The guard reads each v3 text back with the Java FlowScript v3 reader of this library (libs/build).
classpath="$classpath:$root/libs/build/classes"
exec java -Djava.awt.headless=true -Duser.language=en -Duser.country=US -cp "$classpath" \
  org.mozilla.javascript.tools.shell.Main -version 200 "$root/tools/declare-flow-accessibility.js" "$root/_flow" "$project" "$@"
