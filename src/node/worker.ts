import { parentPort, workerData } from "node:worker_threads";
import { executeRecipe } from "../core/execute.js";
try {
  parentPort?.postMessage({
    result: executeRecipe(workerData.input, workerData.recipe),
  });
} catch (error) {
  parentPort?.postMessage({
    error: error instanceof Error ? error.message : "处理失败",
  });
}
