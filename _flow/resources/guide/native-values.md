# Native Convertigo property values
Validate authoring metadata before changing a native bean; report every safe spelling normalization.

Flow authoring properties have a strict contract, distinct from the conversion of business inputs at runtime.

- Boolean properties accept `true` and `false`. A text spelling such as `" FALSE "` is normalized and reported; `"yes"`, `1` and `0` are refused.
- Integer properties accept whole finite numbers and their decimal text spelling, within their declared bounds. `" 60 "` becomes `60` with a notice; `"abc"` is refused.
- Enums accept a constant or an unambiguous display label, ignoring surrounding whitespace and case. `"private"` becomes the native `Private`; `"Bogus"` is refused.
- Native text properties require text. An object description never becomes `[object Object]`.

In `_flow.inputs`, names must match `[A-Za-z_][A-Za-z0-9_]*`, without the reserved `__` prefix. A name such as `$records` is refused: Convertigo would rename it to `_records`, changing the request signature. No input is silently renamed.

Supported input types are `string`, `integer`, `number`, `boolean`, `array`, `object`, `any`, `unknown` and `null`. The historical type aliases `bool`, `int`, `double` and `float` are normalized and reported. `required`, `multi`, `multiValued`, `isFileUpload` and `nullable` are booleans. `visibility` is -1 or an integer mask from 0 to 15. `description` accepts empty text to clear the previous description.

Defaults must satisfy the declared Flow input conversion contract. Their JSON representation is preserved, including objects and arrays; symbol references remain compiled by Convertigo. Do not confuse business input conversion with native authoring property validation.

`code-check` reports an invalid source property at its line. `code-set`, `code-patch` and `code-promote` return safe corrections in `fixes` and the complete corrected source. Native operations report `normalizations`, with `property`, `before` and `after`. Read these fields before continuing.

Every definition in a batch is checked before native setters run. An invalid later input or FullSync variable must leave the earlier beans unchanged. Omitting a property keeps its value; an explicit `false`, `0` or empty description replaces it.

`flow-project-metadata` edits `version` (one line, 1 to 64 characters) and `description` (at most 4000 characters). It does not edit timeouts or CORS.
