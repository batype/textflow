import { LIMITS, type Recipe, type Step } from "./model.js";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function keys(v: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(v))
    if (!allowed.includes(key)) throw Error(`不支持的配置字段：${key}`);
}
function string(v: unknown, label: string, max: number = LIMITS.field) {
  if (typeof v !== "string" || v.length > max)
    throw Error(`${label}必须是字符串，最多 ${max} 个字符`);
}
function bool(v: unknown, label: string) {
  if (v !== undefined && typeof v !== "boolean")
    throw Error(`${label}必须为 boolean`);
}
function flags(v: unknown) {
  if (
    v !== undefined &&
    (typeof v !== "string" ||
      !/^[gimsu]*$/.test(v) ||
      new Set(v).size !== v.length)
  )
    throw Error("正则 flags 仅支持不重复的 g i m s u");
}
export function parseRecipe(raw: unknown): Recipe {
  const v: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!object(v)) throw Error("规则必须是 JSON 对象");
  keys(v, ["version", "steps", "output"]);
  if (v.version !== 1) throw Error("仅支持 version: 1 的规则");
  if (!Array.isArray(v.steps) || v.steps.length > LIMITS.steps)
    throw Error(`处理步骤必须为数组，最多 ${LIMITS.steps} 步`);
  for (const [i, s] of v.steps.entries()) {
    if (!object(s) || typeof s.type !== "string")
      throw Error(`第 ${i + 1} 步缺少 type`);
    bool(s.enabled, "enabled");
    const common = ["type", "enabled"];
    switch (s.type) {
      case "trim":
      case "nonempty":
        keys(s, common);
        break;
      case "dedupe":
        keys(s, [...common, "ignoreCase"]);
        bool(s.ignoreCase, "ignoreCase");
        break;
      case "sort":
        keys(s, [...common, "descending"]);
        bool(s.descending, "descending");
        break;
      case "extract":
        keys(s, [...common, "pattern", "flags", "group"]);
        string(s.pattern, "pattern", LIMITS.pattern);
        flags(s.flags);
        if (
          s.group !== undefined &&
          (!Number.isInteger(s.group) ||
            Number(s.group) < 0 ||
            Number(s.group) > 20)
        )
          throw Error("捕获组需为 0–20 的整数");
        break;
      case "replace":
        keys(s, [...common, "mode", "search", "replacement", "flags"]);
        if (!["literal", "regex"].includes(String(s.mode)))
          throw Error("替换模式需为 literal 或 regex");
        string(s.search, "search", LIMITS.pattern);
        if (!s.search) throw Error("查找内容不能为空");
        string(s.replacement, "replacement");
        flags(s.flags);
        if (
          s.mode === "regex" &&
          /\$(?:`|'|<)/.test(String(s.replacement).replace(/\$\$/g, ""))
        )
          throw Error(
            "正则替换支持 $1…$99、$& 和 $$，不支持上下文或命名组替换",
          );
        break;
      case "affix":
        keys(s, [...common, "prefix", "suffix"]);
        string(s.prefix, "prefix");
        string(s.suffix, "suffix");
        break;
      case "split":
        keys(s, [...common, "separator"]);
        string(s.separator, "separator", 100);
        if (!s.separator) throw Error("拆分分隔符不能为空");
        break;
      default:
        throw Error(`不支持的步骤：${s.type}`);
    }
  }
  if (!object(v.output)) throw Error("缺少 output 配置");
  keys(v.output, ["format", "separator", "spreadsheetSafe"]);
  if (!["text", "json", "csv", "sql-in"].includes(String(v.output.format)))
    throw Error("输出格式需为 text / json / csv / sql-in");
  if (v.output.separator !== undefined)
    string(v.output.separator, "输出分隔符", 100);
  bool(v.output.spreadsheetSafe, "spreadsheetSafe");
  // Snapshot JSON only: consumers never retain or mutate caller-owned recipes.
  return JSON.parse(JSON.stringify(v)) as Recipe;
}
export function validateInput(input: unknown): asserts input is string {
  if (typeof input !== "string") throw Error("输入必须是字符串");
  if (new TextEncoder().encode(input).length > LIMITS.inputBytes)
    throw Error("输入最大 2 MiB，请缩小文件后重试");
}
export function defaultStep(type: Step["type"]): Step {
  switch (type) {
    case "extract":
      return { type, pattern: "userId=(\\d+)", flags: "g", group: 1 };
    case "replace":
      return {
        type,
        mode: "literal",
        search: "old",
        replacement: "new",
        flags: "g",
      };
    case "affix":
      return { type, prefix: "", suffix: "" };
    case "split":
      return { type, separator: "," };
    default:
      return { type };
  }
}
