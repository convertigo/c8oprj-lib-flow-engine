# Project resources: remaining host work

The JS resource API adds `/tests/`, `/docs/` and `/_flow/` before an actual
write or import into `tests/` or `docs/`. It publishes `.httpignore` atomically,
reads the written rules back from disk and refuses the resource write on failure.
It rejects links in resource paths, including existing parents of new files,
and rejects removal/reordering of existing ignore rules or changes to unignore
rules. Required root rules must remain present. `tests/` accepts only the listed
text extensions and rejects binary controls or non-UTF-8 imports.

This does not change the host's project bootstrap or archive exporter. Until the
following host work is integrated, the complete deployment contract is pending.
No Git ignore rule for `docs/` or `tests/` is added by this change.

## Convertigo develop ticket

* `engine/src/com/twinsoft/convertigo/engine/flow/FlowSourceLayout.java`:
  extend `ensureHttpIgnore(File)` and its final-rule detection to retain
  `/_flow/`, `/tests/` and `/docs/` after earlier negations. Keep the regular-file
  check, synchronized publication and atomic replacement. Refuse writes when
  publication fails. Apply this to the new-project bootstrap too, alongside its
  `/_private/` default, without moving notes out of `docs/generated/`.
* Audit the bootstrap call path and source writers using `FlowSourceLayout`,
  including `FlowEngineBridge.createTypeEditorFile`, so the precondition is
  reached before the first source/resource file. The JS MCP resource path already
  performs its own precondition for existing projects; it is not a replacement
  for all Java callers or the bootstrap.
* `engine/src/com/twinsoft/convertigo/engine/servlets/ProjectHttpIgnore.java`:
  keep the `isIgnored(File,String,boolean)` semantics and cache refresh. Extend
  `engine/test/.../servlets/ProjectHttpIgnoreFlowSourceTest.java` and
  `ProjectHttpIgnoreTest.java` for the three final root rules and old negations.
  `ProjectsDataFilter.doFilter` must still stop a GET with 404 through
  `sendNotFoundIfIgnored`, including after an attempted MCP rule removal.
* `engine/src/com/twinsoft/convertigo/engine/util/CarUtils.java`:
  add the root project `tests/` to `getUndeployedFiles(String)`, consumed by
  `makeArchive` and `ZipUtils.makeZip`. Do not exclude `docs/`; do not change Git
  tracking. Verify a real archive entry list, including nested tests files.
* `engine/test/.../flow/FlowSourceLayoutTest.java`: bootstrap has all required
  rules before any target write; failed publication creates no target; earlier
  negations cannot reopen the trees. Include the normal new-project bootstrap
  end to end as well as the layout helper.

## Executable witnesses

`tests/resource-publication.js` uses the real JS Engine API, Java canonical
paths and the image's actual `ProjectsDataFilter.doFilter`, with GET servlet
adapters and no listening HTTP server. It proves existing-project publication,
404, refused rule removal, linked-parent writes and import refusal.
`tests/resource-path-security.cjs` covers extension choices and write ordering,
including an unavailable ignore file. Neither is a deployment-server test.

`tests/ProjectResourceHostContractTest.java` is a separate host acceptance probe:

```sh
java -Djava.io.tmpdir=<owned-fixture-directory> -cp '<runtime>/WEB-INF/lib/*' \
  tests/ProjectResourceHostContractTest.java
```

It calls `FlowSourceLayout.ensureHttpIgnore`, then the production archive
exclusion set and ZIP writer used by `CarUtils`. It requires no project import
or deployment. On the image tested on 17 November it reports the missing
bootstrap `/tests/`, bootstrap `/docs/` and archive exclusion; `docs/` remains
in the archive. It intentionally exits nonzero until that host work is done.
It is separate from the regular JS suite. Fixtures are retained under the caller's
temporary directory for inspection and host cleanup with `gio trash`.

Rerun this probe, the JS witnesses and a real HTTP/new-project/`.car` scenario
on the integrated Java host. The current probe is not a full project bootstrap
or complete `CarUtils.makeArchive` test.
