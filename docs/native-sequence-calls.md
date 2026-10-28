# Explicit native sequence calls

An internal `requestable.call` may pass `input.__nativeCall: true` to a sequence declaring `nativeExecution` and `jsonNativeOutput`, using the existing Convertigo native invocation contract. The engine can run the child in the caller thread when its timeout rules allow it. The regular requester still owns access checks, context cleanup, cache controls and billing.

The native contract returns the business object directly. When an XML step or error builds a document, it instead returns JSON text. Version 0.1.115 decodes that fallback whether it is a JavaScript string or a Java `CharSequence`. Successful objects do not acquire a stringify/parse round trip. Unflagged calls keep their existing output metadata and invocation behavior; this change does not automatically opt every native sequence in.

Validation: `tests/requestable-flow-reentrancy.js` covers the object/text paths, Java host text, regular metadata and cache/context controls. The isolated server qualification additionally checks caller-thread execution, denied authorization, the mandatory published filter and an actual native XMLErrorStep. No Java engine source change is required.
