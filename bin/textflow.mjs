#!/usr/bin/env node
import { readFile, writeFile, lstat, open } from "node:fs/promises";
import { resolve } from "node:path";
import {
  runRecipe,
  parseRecipe,
  presetRecipe,
  PRESETS,
  VERSION,
  LIMITS,
} from "../lib/node/index.js";
const args = process.argv.slice(2);
async function textFile(path, max) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max)
    throw Error("输入需为大小符合限制的普通文件，不读取符号链接");
  return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
}
try {
  if (!args.length || args.includes("--help")) {
    console.log(
      "textflow --in ids.txt|- --preset clean-list|ids-json|sql-in|replace-text|extract-fields [--out result.txt] [--trace]\ntextflow --in input.txt --recipe recipe.json [--out result.json] [--timeout 3000]\ntextflow --list-presets | --version\nWithout --out, writes only transformed text to stdout. Existing output files are never replaced.\nInput: UTF-8, <=2 MiB; recipes <=64 KiB; timeout 100–10000 ms. Rules never execute shell or JavaScript.",
    );
    process.exit(0);
  }
  if (args.includes("--version")) {
    console.log(VERSION);
    process.exit(0);
  }
  if (args.includes("--list-presets")) {
    console.log(PRESETS.map((p) => `${p.id}\t${p.title}`).join("\n"));
    process.exit(0);
  }
  let input,
    output,
    preset,
    recipe,
    timeout = 3000,
    trace = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--trace") {
      trace = true;
      continue;
    }
    if (!["--in", "--out", "--preset", "--recipe", "--timeout"].includes(flag))
      throw Error("未知参数，请使用 --help");
    const value = args[++i];
    if (!value || value.startsWith("--")) throw Error("缺少参数值");
    if (flag === "--in") input = value;
    if (flag === "--out") output = value;
    if (flag === "--preset") preset = value;
    if (flag === "--recipe") recipe = value;
    if (flag === "--timeout") timeout = Number(value);
  }
  if (!input || Boolean(preset) === Boolean(recipe))
    throw Error("需提供 --in，并且选择 --preset 或 --recipe 其中一种");
  let text;
  if (input === "-") {
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > LIMITS.inputBytes) throw Error("stdin 输入最大 2 MiB");
      chunks.push(chunk);
    }
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } else text = await textFile(resolve(input), LIMITS.inputBytes);
  const rules = recipe
    ? parseRecipe(await textFile(resolve(recipe), 64 * 1024))
    : presetRecipe(preset);
  const result = await runRecipe(text, rules, { timeoutMs: timeout });
  if (output) {
    const path = resolve(output);
    if (input !== "-" && path === resolve(input))
      throw Error("输出不能覆盖输入文件");
    if (recipe && path === resolve(recipe)) throw Error("输出不能覆盖规则文件");
    const file = await open(path, "wx", 0o600);
    try {
      await file.writeFile(result.text, "utf8");
    } catch (error) {
      await file.close();
      throw error;
    }
    await file.close();
    console.error(`Saved ${result.outputLines} items to ${path}`);
  } else process.stdout.write(result.text);
  if (trace)
    console.error(
      JSON.stringify({
        inputLines: result.inputLines,
        outputLines: result.outputLines,
        trace: result.trace,
        ms: result.ms,
      }),
    );
  for (const warning of result.warnings) console.error(warning);
} catch (error) {
  console.error(
    error?.code === "EEXIST"
      ? "输出已存在，请选择新文件；没有覆盖原文件。"
      : error instanceof Error
        ? error.message
        : "处理失败",
  );
  process.exitCode = 1;
}
