# Contributing

Use Node.js 22.14+ and `npm ci`. Run `npm test` and `npm run build` before a pull request. Keep shared text semantics in `src/core`; UI and CLI must use that core through terminable workers. Generated `lib/` and `dist/` are not source files.

For a bug report, include a small synthetic input, recipe, expected output and actual output. Avoid production logs, tokens or private identifiers. Changes to escaping, line splitting, ordering, limits or output formats need focused regression coverage. Do not add network processing or persist source text as an incidental UI change.
