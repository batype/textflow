import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { runRecipe, presetRecipe, VERSION } from "../lib/node/index.js";
const dir = await mkdtemp(join(tmpdir(), "textflow-cli-"));
after(() => rm(dir, { recursive: true, force: true }));
const cli = resolve("bin/textflow.mjs");
const run = (args, input) =>
  spawnSync(process.execPath, [cli, ...args], {
    cwd: dir,
    encoding: "utf8",
    input,
  });
test("CLI and Node API have identical output, emit no input values in trace and strictly decode UTF-8", async () => {
  const text = "  secret-fixture\n secret-fixture \n second";
  await writeFile(join(dir, "input.txt"), text);
  const rules = presetRecipe("clean-list");
  await writeFile(join(dir, "recipe.json"), JSON.stringify(rules));
  const result = run([
    "--in",
    "input.txt",
    "--recipe",
    "recipe.json",
    "--trace",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, (await runRecipe(text, rules)).text);
  assert(!result.stderr.includes("secret-fixture"));
  assert.equal(JSON.parse(result.stderr).outputLines, 2);
  await writeFile(join(dir, "bad.txt"), Buffer.from([0xc3, 0x28]));
  assert.notEqual(run(["--in", "bad.txt", "--preset", "clean-list"]).status, 0);
});
test("CLI writes new output only, rejects existing files, same input paths, symlinks and unknown flags", async () => {
  const source = join(dir, "source.txt");
  await writeFile(source, "a\na\nb");
  const args = ["--in", source, "--preset", "clean-list"];
  assert.equal(run([...args, "--out", "output.txt"]).status, 0);
  assert.equal(await readFile(join(dir, "output.txt"), "utf8"), "a\nb");
  assert.notEqual(run([...args, "--out", "output.txt"]).status, 0);
  assert.notEqual(run([...args, "--out", source]).status, 0);
  await symlink(source, join(dir, "alias.txt"));
  assert.notEqual(run([...args, "--out", "alias.txt"]).status, 0);
  assert.equal(await readFile(source, "utf8"), "a\na\nb");
  assert.notEqual(
    run(["--in", "alias.txt", "--preset", "clean-list"]).status,
    0,
  );
  assert.notEqual(run([...args, "--execute"]).status, 0);
});
test("CLI accepts stdin, reports version/presets and exits nonzero on invalid recipes/timeouts", () => {
  assert.equal(
    run(["--in", "-", "--preset", "clean-list"], "a\na\nb").stdout,
    "a\nb",
  );
  assert.equal(run(["--version"]).stdout.trim(), VERSION);
  assert.match(run(["--list-presets"]).stdout, /ids-json/);
  assert.notEqual(run(["--in", "-", "--preset", "unknown"], "x").status, 0);
  assert.notEqual(
    run(["--in", "-", "--preset", "clean-list", "--timeout", "0"], "x").status,
    0,
  );
});

test("public API works from an inline ESM consumer without inheriting eval/input-type flags into the worker", () => {
  const moduleURL = new URL("../lib/node/index.js", import.meta.url).href;
  const code = `import {runRecipe,presetRecipe} from ${JSON.stringify(moduleURL)}; const r=await runRecipe('a\\na',presetRecipe('clean-list')); if(r.text!=='a')process.exit(2);`;
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", code],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
});
