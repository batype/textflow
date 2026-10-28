import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runRecipe,
  parseRecipe,
  presetRecipe,
  PRESETS,
  LIMITS,
} from "../lib/node/index.js";
const recipe = (steps = [], format = "text", extra = {}) => ({
  version: 1,
  steps,
  output: { format, ...extra },
});
test("log preset extracts and deduplicates 19-digit IDs as exact strings with trace counts", async () => {
  const r = await runRecipe(PRESETS[0].input, presetRecipe("ids-json"));
  assert.deepEqual(JSON.parse(r.text), [
    "1928374650123456789",
    "1928374650123456790",
    "1928374650123456791",
  ]);
  assert.deepEqual(
    r.trace.map((t) => [t.before, t.after]),
    [
      [6, 5],
      [5, 3],
    ],
  );
  assert.equal(r.inputLines, 6);
  assert.equal(r.outputLines, 3);
});
test("cleaning handles CRLF, Unicode whitespace, blank rows, stable case-sensitive and optional case-insensitive deduplication", async () => {
  const input = "  A\r\na\r\n\r\n\u2003B\u2003\r\nA\r\n";
  const a = await runRecipe(input, presetRecipe("clean-list"));
  assert.deepEqual(a.lines, ["A", "a", "B"]);
  const config = presetRecipe("clean-list");
  config.steps[2].ignoreCase = true;
  assert.deepEqual((await runRecipe(input, config)).lines, ["A", "B"]);
  assert.equal((await runRecipe("", recipe())).inputLines, 0);
  assert.deepEqual((await runRecipe("\n", recipe())).lines, [""]);
});
test("split, trim, stable ordering, affixes and disabled steps compose without coercing values", async () => {
  const r = await runRecipe(
    "02,1,10\n02,2",
    recipe(
      [
        { type: "split", separator: "," },
        { type: "dedupe" },
        { type: "sort" },
        { type: "affix", prefix: "[", suffix: "]" },
        { type: "trim", enabled: false },
      ],
      "json",
    ),
  );
  assert.deepEqual(JSON.parse(r.text), ["[02]", "[1]", "[10]", "[2]"]);
  assert.equal(r.trace[4].enabled, false);
  assert.equal(r.trace[4].before, r.trace[4].after);
});
test("extract supports captures and first/global matches per line, rejecting invalid and empty matches", async () => {
  const step = { type: "extract", pattern: "id=(\\d+)", group: 1, flags: "g" };
  assert.deepEqual((await runRecipe("id=1 id=2\nid=3", recipe([step]))).lines, [
    "1",
    "2",
    "3",
  ]);
  assert.deepEqual(
    (await runRecipe("id=1 id=2\nid=3", recipe([{ ...step, flags: "" }])))
      .lines,
    ["1", "3"],
  );
  await assert.rejects(
    runRecipe("x", recipe([{ type: "extract", pattern: "[" }])),
    /第 1 步.*正则/,
  );
  await assert.rejects(
    runRecipe("x", recipe([{ type: "extract", pattern: ".*?" }])),
    /空文本/,
  );
  const empty = await runRecipe("x", recipe([step], "json"));
  assert.equal(empty.text, "[]");
  assert.equal(empty.warnings.length, 1);
});
test("literal replacement treats punctuation, backslashes, dollar signs and substitutions literally", async () => {
  for (const search of [".", "[", "]", "\\", "a+b", "${x}"]) {
    const input = `before${search}after${search}`;
    const r = await runRecipe(
      input,
      recipe([
        { type: "replace", mode: "literal", search, replacement: "$1-$&-$$" },
      ]),
    );
    assert.equal(r.text, input.split(search).join("$1-$&-$$"));
  }
});
test("regex replacement matches native JS numeric captures, whole match, dollars and unmatched groups within the supported subset", async () => {
  for (const replacement of ["$2/$1", "$$-$&-$1", "$12-$3", "$0-$99"]) {
    const r = await runRecipe(
      "ab ab",
      recipe([
        {
          type: "replace",
          mode: "regex",
          search: "(a)(b)",
          flags: "g",
          replacement,
        },
      ]),
    );
    assert.equal(r.text, "ab ab".replace(/(a)(b)/g, replacement));
  }
  const r = await runRecipe(
    "b",
    recipe([
      { type: "replace", mode: "regex", search: "(a)?b", replacement: "$1" },
    ]),
  );
  assert.equal(r.text, "");
});
test("JSON preserves quotes, leading zeros, Unicode and arbitrary-sized numeric text", async () => {
  const items = ["001", "9223372036854775808", 'a"b', "中文"];
  const r = await runRecipe(items.join("\n"), recipe([], "json"));
  assert.deepEqual(JSON.parse(r.text), items);
  assert.equal(r.outputBytes, Buffer.byteLength(r.text));
});
test("PostgreSQL IN escapes quotes and backslashes; rejects empty lists and NUL instead of emitting invalid fragments", async () => {
  const r = await runRecipe("O'Reilly\na\\b\n001", recipe([], "sql-in"));
  assert.equal(r.text, "IN ('O''Reilly', E'a\\\\b', '001')");
  await assert.rejects(runRecipe("", recipe([], "sql-in")), /空列表/);
  await assert.rejects(runRecipe("\0", recipe([], "sql-in")), /NUL/);
});
test("CSV exports one column with RFC-style quoting, explicit empty cells and optional formula text protection", async () => {
  const r = await runRecipe('a,b\n"quote"\n=1+1\n\n', recipe([], "csv"));
  assert.equal(r.text, '"a,b"\r\n"""quote"""\r\n\'=1+1\r\n""');
  assert.equal(r.warnings.length, 1);
  assert.equal(
    (await runRecipe("=1+1", recipe([], "csv", { spreadsheetSafe: false })))
      .text,
    "=1+1",
  );
});
test("recipe schema rejects executable/unknown fields, malformed parameters and unsupported context substitutions", () => {
  for (const value of [
    { ...recipe(), version: 2 },
    { ...recipe(), code: "process.exit()" },
    recipe([{ type: "eval" }]),
    recipe([{ type: "extract", pattern: 1 }]),
    recipe([{ type: "extract", pattern: "x", flags: "gg" }]),
    recipe([{ type: "extract", pattern: "x", group: 21 }]),
    recipe([{ type: "split", separator: "" }]),
    recipe([
      { type: "replace", mode: "regex", search: "x", replacement: "$'" },
    ]),
    recipe(Array(13).fill({ type: "trim" })),
  ])
    assert.throws(() => parseRecipe(value));
  const original = recipe([{ type: "trim" }]);
  const copy = parseRecipe(original);
  copy.steps[0].enabled = false;
  assert.equal(original.steps[0].enabled, undefined);
});
test("input, line and output expansion limits fail predictably before oversized results are returned", async () => {
  await assert.rejects(
    runRecipe("x".repeat(LIMITS.inputBytes + 1), recipe()),
    /2 MiB/,
  );
  await assert.rejects(runRecipe("x\n".repeat(50001), recipe()), /50,000/);
  await assert.rejects(
    runRecipe(
      "x".repeat(10000),
      recipe([
        {
          type: "replace",
          mode: "literal",
          search: "x",
          replacement: "y".repeat(2000),
        },
      ]),
    ),
    /8 MiB/,
  );
  await assert.rejects(
    runRecipe(
      "x".repeat(5000),
      recipe([{ type: "extract", pattern: "(?=(.*)).", group: 1 }]),
    ),
    /8 MiB/,
  );
});
test("catastrophic regex is terminated without blocking caller, then a subsequent run succeeds", async () => {
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10);
  try {
    await assert.rejects(
      runRecipe(
        "a".repeat(10000) + "!",
        recipe([{ type: "extract", pattern: "^(a+)+$" }]),
        { timeoutMs: 200 },
      ),
      /超时/,
    );
    assert(ticks > 2);
  } finally {
    clearInterval(timer);
  }
  assert.equal((await runRecipe("ok", recipe())).text, "ok");
});
test("cancellation terminates active workers and respects already-aborted signals", async () => {
  const controller = new AbortController();
  const pending = runRecipe(
    "a".repeat(10000) + "!",
    recipe([{ type: "extract", pattern: "^(a+)+$" }]),
    { signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(
    runRecipe("x", recipe(), { signal: controller.signal }),
    { name: "AbortError" },
  );
  await assert.rejects(runRecipe("x", recipe(), { timeoutMs: 1 }), /timeoutMs/);
});
