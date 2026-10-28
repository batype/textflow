# Node API and CLI

Node.js >=22.14. The transformation package has no runtime npm dependencies. React and Vite are development dependencies for the website only.

```ts
import {
  runRecipe,
  presetRecipe,
  parseRecipe,
  type Recipe,
} from "@batype/textflow";
const rules: Recipe = presetRecipe("ids-json");
const result = await runRecipe("userId=001\nuserId=002\nuserId=001", rules);
console.log(result.text); // formatted ["001", "002"]
console.log(result.trace); // before/after counts and timings, no source text
```

`runRecipe(input, recipe, {timeoutMs?: number, signal?: AbortSignal}): Promise<Result>`

A worker thread processes the input, including potentially pathological regular expressions. The caller remains responsive. Default timeout 3000 ms; accepted range 100–10000 ms. Cancellation rejects with `AbortError`. Errors reject the promise; there is no partial success result.

`Result` contains `text`, `lines` (string[]), `trace` (index/type/enabled/before/after/ms), `inputLines`, `outputLines`, UTF-8 `inputBytes` / `outputBytes`, total worker `ms`, `warnings`, and `format`. Timings exclude worker startup and are not deterministic; text and counts are deterministic. Trace never contains input values, but `text` and `lines` do.

`parseRecipe(objectOrJSON)` validates and snapshots a recipe. `presetRecipe(id)` returns a fresh preset copy. `PRESETS`, `STEP_NAMES`, `LIMITS`, `VERSION`, and TypeScript types are also exported. The synchronous internal engine is not a public package export; use the worker-backed API.

Full rule and format contract: [recipes.md](../skills/textflow/references/recipes.md).

## CLI

```sh
textflow --in input.txt --recipe textflow.recipe.json --out result.json --trace
textflow --in input.log --preset ids-json --out ids.json
textflow --in - --preset clean-list
textflow --list-presets
textflow --version
```

Without `--out`, stdout is exactly the transformed text, with no appended newline. `--trace` reports counts and timings as one JSON object on stderr. Warnings are separate stderr lines. The CLI reads strict UTF-8; input <=2 MiB and recipe <=64 KiB. File paths in flags resolve from the current working directory. It does not follow input symlinks, evaluate variables, read URLs or execute commands. Output is created with `wx` and mode 0600: existing files, symlinks and identical input/output or recipe/output paths are rejected. Parent directories must exist. A filesystem write failure may leave a newly created partial output; the CLI exits nonzero and never reports it as success.
