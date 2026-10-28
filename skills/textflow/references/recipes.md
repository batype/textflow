# TextFlow recipe schema · v1

A recipe is a strict JSON object. Unknown properties are rejected; all output values stay strings.

```json
{
  "version": 1,
  "steps": [
    { "type": "extract", "pattern": "userId=(\\d+)", "flags": "g", "group": 1 },
    { "type": "dedupe" }
  ],
  "output": { "format": "json" }
}
```

Each step can set `enabled:false`. A maximum of 12 steps runs in order.

| type     | Additional fields                                                           | Behavior                                                                                                                                                     |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| trim     | none                                                                        | Trim Unicode whitespace from both ends                                                                                                                       |
| nonempty | none                                                                        | Drop whitespace-only items                                                                                                                                   |
| dedupe   | ignoreCase?: boolean                                                        | Retain first occurrence, preserving its original value                                                                                                       |
| sort     | descending?: boolean                                                        | UTF-16 lexical order; no numeric coercion or locale collation                                                                                                |
| extract  | pattern: string, flags?: string, group?: integer 0–20                       | Regex per item; default flags g, group 0. No-match rows yield no items. Empty full matches are rejected.                                                     |
| replace  | mode: literal or regex, search: string, replacement: string, flags?: string | Literal mode replaces all occurrences and treats dollars literally. Regex defaults to g and supports $1…$99, $&, $$. No context or named-group substitution. |
| affix    | prefix: string, suffix: string                                              | Add literal text to every item                                                                                                                               |
| split    | separator: nonempty string                                                  | Split each item by literal delimiter                                                                                                                         |

Regexes use JavaScript, with unique flags from `gimsu`. Do not include the surrounding `/`. No cross-line matching: initial input splits CRLF/LF/CR. A final line terminator does not create an extra record. Sorting and case folding do not Unicode-normalize text.

Output:

- `{"format":"text","separator":"\n"}`: text joined by the separator; default newline.
- `{"format":"json"}`: indented JSON array of strings.
- `{"format":"csv","spreadsheetSafe":true}`: one-column CRLF CSV. Quotes, commas and embedded newlines are quoted; empty cells are explicit `""`. Formula-like values (leading whitespace followed by = + - @) receive an apostrophe prefix by default. Set false to retain raw CSV values; JSON always retains original strings.
- `{"format":"sql-in"}`: PostgreSQL string fragment, e.g. `IN ('001', '002')`. Apostrophes are doubled; backslashes use escaped `E` strings. Empty arrays and NUL are errors. No database execution; use application parameters for live queries.

Input: 2 MiB, up to 50,000 items. Intermediate/output: 8 MiB, up to 50,000 items. Pattern/search length: 1,000 characters; replacement/prefix/suffix: 2,000; separator: 100. Worker timeout: browser 2 seconds, Node default 3 seconds (configurable 100–10,000 ms). Exceeding a limit fails the task instead of truncating data.
