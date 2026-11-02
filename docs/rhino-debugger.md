# Rhino block debugging

Requires Convertigo's private provider-debugging API from #1261 and lib_flow_engine 0.2.19. Start the JavaScript debugger in either Studio, set a breakpoint in a Rhino block file, and launch the Flow through that Studio. Pause next also works. Only explicitly selected requests use interpreted implementations.

The runtime first resolves its normal compiled execution metadata, then gives the selected invocation a separate plan with lazy block adapters and private prepared-node state. Each executed Rhino implementation is compiled directly, evaluated without debugger pauses, and retained only in that invocation's context. Its exported methods and prepared runners execute with the request debugger attached. Stateless exports, shared runners, prepared scripts and disk bytecode are never used for these private calls. The normal plan, runners and caches are not replaced or invalidated.

Source URLs use `project/relative/path.js`. For inline `.block.js` implementations, the static `_meta` header is blanked without trimming the remaining source: editor lines therefore remain exact. Files using `implementation.file` use that file directly. Included-file helper-prefix conventions are preserved by the Java API. Local bindings, arguments, implementation closures and `this` can be inspected; traversal stops before the provider execution scope.

All selected invocations opt in, rather than checking their initial breakpoint list. This supports Pause next, stepping from a legacy caller, and adding a breakpoint while a request is running. Ordinary requests choose their original plan once per invocation; their node runners have no new debugger callback or branch. They can run while a selected request is paused.

Shared runtime construction stays compiled and cannot attach private functions. Initialization is deliberately not line-debuggable. Engine modules and libraries, including stateless libraries, remain compiled; private library/module evaluation is a future extension. This release does not implement breakpoints on Flow nodes or a logical Flow stack. An exception, detach or business timeout keeps the existing #1261 lifetime rules; stopping the debugger lets the request finish.

Validation includes the engine's `FlowDebuggerBoundaryTest`, this library's `tools/run-tests.sh`, and a live Docker/Playwright recipe retained with the mission artifacts. The live fixture has a multiline `_meta` header, a stateless implementation and a prepared runner, so it exercises source offsets and warm-cache bypass.
