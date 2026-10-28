export const VERSION = "1.0.0";
export const LIMITS = {
  inputBytes: 2 * 1024 * 1024,
  outputBytes: 8 * 1024 * 1024,
  lines: 50000,
  steps: 12,
  pattern: 1000,
  field: 2000,
} as const;
export type Step = { enabled?: boolean } & (
  | { type: "trim" }
  | { type: "nonempty" }
  | { type: "dedupe"; ignoreCase?: boolean }
  | { type: "sort"; descending?: boolean }
  | { type: "extract"; pattern: string; flags?: string; group?: number }
  | {
      type: "replace";
      mode: "literal" | "regex";
      search: string;
      replacement: string;
      flags?: string;
    }
  | { type: "affix"; prefix: string; suffix: string }
  | { type: "split"; separator: string }
);
export type Format = "text" | "json" | "csv" | "sql-in";
export type Recipe = {
  version: 1;
  steps: Step[];
  output: { format: Format; separator?: string; spreadsheetSafe?: boolean };
};
export type Trace = {
  index: number;
  type: Step["type"];
  enabled: boolean;
  before: number;
  after: number;
  ms: number;
};
export type Result = {
  text: string;
  lines: string[];
  trace: Trace[];
  inputLines: number;
  outputLines: number;
  inputBytes: number;
  outputBytes: number;
  ms: number;
  warnings: string[];
  format: Format;
};
export const STEP_NAMES: Record<Step["type"], string> = {
  trim: "去除首尾空白",
  nonempty: "删除空行",
  dedupe: "列表去重",
  sort: "文本排序",
  extract: "正则提取",
  replace: "批量替换",
  affix: "添加前后缀",
  split: "按分隔符拆分",
};
