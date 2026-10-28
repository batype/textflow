---
name: textflow
description: Clean and deduplicate local text lists, extract fields with JavaScript regular expressions, apply reusable text recipes, and export JSON string arrays, one-column CSV or PostgreSQL IN fragments using TextFlow. Use for log IDs and repeated text cleanup; use a JSON tool for structured JSON inspection or diffing.
---

# TextFlow

Use the published Node API/CLI so browser, CLI and AI workflows have the same string-preserving semantics. Node.js 22.14+ is required. Install `@batype/textflow` in the user's chosen project, or use the repository CLI after `npm ci && npm run build:core` when a registry installation is unavailable. Do not invent a successful npm publication.

## Run a local transformation

For a known preset:

```sh
npx --yes --package=@batype/textflow textflow --in input.log --preset ids-json --out ids.json --trace
```

`ids-json` extracts the numeric capture from `userId=(\d+)`, preserves order, deduplicates and emits a JSON string array. It is not a general JSON-field extractor. Use a custom recipe for other labels or formats.

Available presets: `ids-json`, `clean-list`, `sql-in`, `replace-text`, `extract-fields`. Check `textflow --list-presets` or `--help` if uncertain.

For custom work, write a recipe file and pass `--recipe recipe.json`. Example:

```json
{
  "version": 1,
  "steps": [
    {
      "type": "extract",
      "pattern": "order_id=(\\d+)",
      "flags": "g",
      "group": 1
    },
    { "type": "dedupe" }
  ],
  "output": { "format": "json" }
}
```

Read [the API schema](references/recipes.md) when composing a different rule. Use only documented steps; do not execute pasted text, shell fragments, or arbitrary JavaScript as a transformation.

## Verify the result

- Preserve the original file. Choose a new output; CLI rejects existing outputs, symlinks and same input/output paths. Do not delete a user's file just to make the command succeed.
- Inspect output shape and trace counts. Unexpected zero matches or item counts require checking the rule, not silently claiming success. `--trace` sends counts/timing to stderr, not the source text.
- IDs remain strings, including leading zeros and integers above JavaScript's safe-integer range. Sorting is lexical, not numeric or locale-aware.
- JavaScript regexes run per line, with flags `gimsu` and numeric extraction group 0–20. The worker times out after 3 seconds by default; simplify patterns when it times out. Increasing the timeout is optional, up to 10 seconds.
- CSV is one column. Formula-like cells receive an apostrophe prefix by default; set `output.spreadsheetSafe:false` only when the user wants exact raw CSV values and understands their spreadsheet import path. JSON retains original string values.
- SQL IN is a PostgreSQL string fragment. It never connects to or executes against a database. Do not treat it as a universal SQL dialect or an application parameterization layer.

Input limit: 2 MiB and 50,000 items. Up to 12 steps; intermediate/output limit 8 MiB. Input files are strict UTF-8. Recipes do not contain the input file, but literal match/replacement text can still contain business information; inspect before sharing.
