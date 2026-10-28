import { Worker } from "node:worker_threads";
import { parseRecipe, validateInput } from "../core/validate.js";
import type { Result } from "../core/model.js";
export { parseRecipe, defaultStep } from "../core/validate.js";
export { PRESETS, presetRecipe } from "../core/presets.js";
export { VERSION, LIMITS, STEP_NAMES } from "../core/model.js";
export type { Recipe, Step, Result, Trace, Format } from "../core/model.js";
/** Async worker boundary also applies to programmatic use; regex never blocks the caller. */
export async function runRecipe(
  input: string,
  recipe: unknown,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Result> {
  validateInput(input);
  const snapshot = parseRecipe(recipe),
    timeout = options.timeoutMs ?? 3000;
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 10000)
    throw Error("timeoutMs 应为 100–10000 的整数");
  if (options.signal?.aborted)
    throw new DOMException("处理已取消", "AbortError");
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.js", import.meta.url), {
      workerData: { input, recipe: snapshot },
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    let done = false;
    const finish = (error: unknown, result?: Result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      void worker.terminate();
      error ? reject(error) : resolve(result!);
    };
    const abort = () => finish(new DOMException("处理已取消", "AbortError"));
    const timer = setTimeout(
      () => finish(Error("处理超时，Worker 已终止；请简化正则或减少输入")),
      timeout,
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.once("message", (data) =>
      data.error ? finish(Error(data.error)) : finish(undefined, data.result),
    );
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      if (!done) finish(Error(`处理 Worker 意外退出（${code}）`));
    });
  });
}
