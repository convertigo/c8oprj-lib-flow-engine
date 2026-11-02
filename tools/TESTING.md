# Offline Flow library suites

Place the five repositories side by side as `lib_flow_engine`, `lib_flow_mcp`,
`lib_flow_sql`, `lib_flow_crud_data`, `lib_flow_frontbuilder_svelte`, with a
`convertigo` checkout if using automatic classpath discovery. The harness also
recognizes the `c8oprj-lib-flow-*` directory names. Each library's entry point is:

```sh
bash tools/run-tests.sh                 # from that library, independent of cwd
bash tools/run-tests.sh name-fragment   # select programs by filename
```

The other four entry points use this Engine's `tools/run-library-tests.cjs`.
Apply the Engine runner commit too when importing their incremental bundles.
No Docker, server, npm global install, or production database is needed.

## Prerequisites

Use Node 24 (tested with 24.18.1), npm, and a JDK able to load your runtime JARs.
The copied nighttime classpath runs with JDK 21; building and running Convertigo
`1c8f10c83` requires **JDK 25** (its Gradle toolchain and release level are 25).
SQL/CRUD helper sources themselves still target Java 17.
Ensure they are on PATH before starting. Install the locked frontend dependencies
and build the provider once:

```sh
cd lib_flow_frontbuilder_svelte/_flow/frontbuilder/svelte
npm ci
```

`npm ci` runs `build:provider` via postinstall. The frontend entry point rebuilds
it explicitly too. The Engine and MCP tests require this installed provider,
including jsdom and Ajv; the shared harness sets all three resource-root variables.
For a different checkout layout set:

```sh
export FLOW_ENGINE_RESOURCE_ROOT=/path/to/lib_flow_engine/_flow
export FLOW_FRONTBUILDER_RESOURCE_ROOT=/path/to/lib_flow_frontbuilder_svelte/_flow/frontbuilder/svelte
```

## Complete Convertigo classpath

The harness also passes the complete resolved classpath to Node parity tests
through their historical `CONVERTIGO_DEPENDENCIES_JAR` variable (these tests use
its value as Java `-cp`).

The dependencies JAR contains Rhino but does **not** contain Convertigo's own
engine classes. Build the matching Convertigo checkout (Mission 28 source base:
`1c8f10c83c851cec2a0b319544a99b2020259b11`):

```sh
export JAVA_HOME=/path/to/jdk-25
export PATH="$JAVA_HOME/bin:$PATH"
cd convertigo
bash gradlew --no-daemon :engine:jar :engine:dependenciesJar
```

The harness discovers `convertigo/engine/build/libs` automatically. Override the
location with `CONVERTIGO_ROOT`, or give an explicit Java classpath, for example:

```sh
export CONVERTIGO_TEST_CLASSPATH='/path/to/owned-runtime/WEB-INF/lib/*'
# Alternatively:
export CONVERTIGO_ENGINE_JAR=/path/to/convertigo-engine-8.5.0-beta.jar
export CONVERTIGO_DEPENDENCIES_JAR=/path/to/dependencies-8.5.0-beta.jar
```

Use one coherent engine/runtime distribution. The preflight loads
`FlowEngineBridge` and initializes `EnginePropertiesManager`. A classpath that
only provides Rhino fails before launching hundreds of tests. Rhino programs
run with ES6 (`-version 200`), headless AWT, initialized properties, and
`SERVER_BUILD=studio` **inside the isolated JVM only**, so frontend fixture
builds are allowed. The bootstrap exits explicitly after the test completes,
including when Java executors would otherwise keep the process alive.

`crypto-password-blocks.js` deliberately starts without initialized server
properties: it asserts that `crypto.serverKey` is unavailable in a shell. Its
JVM skips the property bootstrap; applying the frontend bootstrap to that test
would expose the runtime's default test passphrase and invalidate its premise.

## SQL and CRUD

The harness finds thin Maven JARs in `$GRADLE_USER_HOME/caches`, `~/.gradle/caches`
or `~/.m2/repository`, or accepts these explicit paths:

```sh
export FLOW_RHINO_JAR=/path/to/rhino-1.9.1.jar
export FLOW_RHINO_TOOLS_JAR=/path/to/rhino-tools-1.9.1.jar
export FLOW_QUERYDSL_CORE_JAR=/path/to/querydsl-core-7.7.jar
export FLOW_QUERYDSL_SQL_JAR=/path/to/querydsl-sql-7.7.jar
export FLOW_HSQLDB_JAR=/path/to/hsqldb-2.7.4.jar
```

Rhino and rhino-tools must have the same version. Querydsl coordinates and
checksums are committed in `lib_flow_sql/libs/jars.yaml`. They are
`io.github.openfeign.querydsl:querydsl-core:7.7` and `querydsl-sql:7.7`.
SQL requires the sibling CRUD checkout, or `FLOW_CRUD_DATA_DIR=<project>`.
Missing engine/CRUD checkouts cause an error; Flow tests are never silently
omitted by the unified runner. SQL runs its official 15-program shell suite,
then `query-missing-parameter.cjs`. CRUD runs its thin-classpath Java suite and
all five Flow/block test programs. The official SQL shell supports optional
PostgreSQL fixtures via `FLOW_SQL_TEST_PG_*`; these are not required by the
local HSQLDB suite. No external database is contacted by default.

## Logs, scope, and additional harnesses

`FLOW_TEST_JOBS` defaults to 2 (1 for SQL/frontend), `FLOW_TEST_TIMEOUT_MS` to
400000 per standalone program, 900000 for the frontend suite, and 1800000 for
the complete SQL shell invocation (15 programs). Override it for slower hosts.
`FLOW_TEST_LOG_DIR` overrides `_private/test-results/<timestamp>`.
An interrupted run can continue with `FLOW_TEST_RESUME=1` and the same explicit
`FLOW_TEST_LOG_DIR`, arguments, filter and checkout paths. It skips recorded
programs and checks that their commands and logs still match. Recorded failures
remain failures in the final total; resume does not erase them. Choose another
log directory for a clean run or an isolated recheck. Resume only when product,
test and dependency contents are unchanged: the guard compares argv and log
existence, not source/dependency fingerprints.

`results.json` records each actual argv, cwd, exit code, timeout, duration and
log path. Every failed child makes the runner fail. A nonexistent filter also
fails. The runner does not download dependencies or mask missing prerequisites.

The Engine/MCP totals count standalone `tests/*.js` and `tests/*.cjs` programs;
`tests/run-rhino.cjs` is a helper and is excluded. Explicit MCP argument-order
exceptions live in `lib_flow_mcp/tools/test-arguments.json`, including
`experience-cost.js` which loads the experience fixture.

Two additional standalone Java harnesses can be invoked separately. The historical
`FlowSharedMachineTest.java` targets experimental shared-machine APIs which are
absent from Convertigo `1c8f10c83`; it does not compile on that base (36 missing
symbols). This is inherited from `ace/night-fixes`, not a runnable part of the
273-program reference suite. Do not count it as passed with this runtime.
`FrontendSourceWriteConcurrencyTest.java` is JDK-only and runs on that base:


```sh
java -Djava.awt.headless=true -cp "$CONVERTIGO_TEST_CLASSPATH" \
  lib_flow_engine/tests/FlowSharedMachineTest.java
java -Djava.awt.headless=true \
  lib_flow_mcp/tests/FrontendSourceWriteConcurrencyTest.java
```

The latter exercises a Java-only lock/revision/atomic-move model, not the real
MCP block concurrently. `lib_flow_mcp/tests/tags-http-contract.mjs` requires an
owned disposable HTTP runtime, project, SDK and credentials; its prerequisites
are documented at the top of that file. It is not part of the historical offline
suite and is not silently presented as passed. Offline suites do not certify
interactive Studio behavior or shared Studio session isolation.
