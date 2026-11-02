# Qualified JavaScript modules from referenced providers

`ctx.lib("provider.module")` resolves `_flow/lib/module.js` only in an actually referenced provider project named `provider`. Consumer-local modules cannot shadow the qualified identity. Existing unqualified local/core resolution is preserved. Qualified modules are listed in the library catalog with reference origin. A qualified local module name uses only letters, digits, `_` or `-`; it cannot traverse directories.

This is the module counterpart of existing referenced blocks and frontend components. It introduces no entity vocabulary and changes no Java bridge. Stateless modules must still obey the existing immutable-state / thread-safe-cache contract. Dependencies remain explicit through block metadata `uses`.

Regression: `node tests/referenced-modules.cjs`; real referenced module loading is also exercised by the entity plugin's Flow and HTTP integration suites.
