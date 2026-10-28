import type { Recipe } from "./model.js";
export type Preset = {
  id: string;
  title: string;
  description: string;
  symbol: string;
  input: string;
  recipe: Recipe;
};
const clean = [
  { type: "trim" as const },
  { type: "nonempty" as const },
  { type: "dedupe" as const },
];
export const PRESETS: Preset[] = [
  {
    id: "ids-json",
    title: "日志取 ID",
    description: "提取 · 去重 · 转数组",
    symbol: "{ }",
    input:
      "[09:41:02] INFO userId=1928374650123456789 action=login\n[09:41:03] INFO userId=1928374650123456790 action=login\n[09:41:04] INFO userId=1928374650123456789 action=refresh\n[09:41:05] INFO userId=1928374650123456791 action=login\n[09:41:06] INFO userId=1928374650123456790 action=logout\n[09:41:07] INFO healthcheck=ok",
    recipe: {
      version: 1,
      steps: [
        { type: "extract", pattern: "userId=(\\d+)", flags: "g", group: 1 },
        { type: "dedupe" },
      ],
      output: { format: "json" },
    },
  },
  {
    id: "clean-list",
    title: "整理列表",
    description: "去空白 · 去空行 · 去重",
    symbol: "≡",
    input: "  alpha\nbeta\n\nalpha\n  gamma  \nbeta\n",
    recipe: { version: 1, steps: clean, output: { format: "text" } },
  },
  {
    id: "sql-in",
    title: "生成 SQL IN",
    description: "列表 → 字符串片段",
    symbol: "IN",
    input: "10001\n10002\n10001\n10003",
    recipe: { version: 1, steps: clean, output: { format: "sql-in" } },
  },
  {
    id: "replace-text",
    title: "批量替换",
    description: "替换文字 · 添加前缀",
    symbol: "a↔b",
    input: "old_api_key\nold_api_url\nold_api_timeout",
    recipe: {
      version: 1,
      steps: [
        {
          type: "replace",
          mode: "literal",
          search: "old_",
          replacement: "new_",
        },
        { type: "affix", prefix: "APP_", suffix: "" },
      ],
      output: { format: "text" },
    },
  },
  {
    id: "extract-fields",
    title: "提取字段",
    description: "正则捕获 · 直接复用",
    symbol: ".*",
    input:
      "order_id=10001 status=paid\norder_id=10002 status=pending\norder_id=10001 status=shipped",
    recipe: {
      version: 1,
      steps: [
        { type: "extract", pattern: "order_id=(\\d+)", flags: "g", group: 1 },
        { type: "dedupe" },
      ],
      output: { format: "json" },
    },
  },
];
export function presetRecipe(id: string): Recipe {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw Error(`未知模板：${id}`);
  return JSON.parse(JSON.stringify(preset.recipe));
}
