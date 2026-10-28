import { executeRecipe } from "../core/execute.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      id: data.id,
      result: executeRecipe(data.input, data.recipe),
    });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : "处理失败",
    });
  }
};
