import { LIMITS, type Recipe, type Result, type Step } from "./model.js";
import { parseRecipe, validateInput } from "./validate.js";
const bytes = (text: string) => new TextEncoder().encode(text).length;
function bounded(lines: string[]) {
  if (lines.length > LIMITS.lines)
    throw Error("最多处理 50,000 项，请缩小输入或减少提取结果");
  let size = 0;
  for (const line of lines) {
    size += bytes(line) + 1;
    if (size > LIMITS.outputBytes)
      throw Error("中间结果超过 8 MiB，请减少规则扩展或输入");
  }
  return lines;
}
function regex(pattern: string, flags = "g") {
  try {
    return new RegExp(pattern, flags);
  } catch {
    throw Error("正则表达式无效，请检查括号、转义和 flags");
  }
}
function apply(lines: string[], s: Step): string[] {
  const out: string[] = [];
  let size = 0;
  const push = (v: string) => {
    if (v.length > LIMITS.outputBytes) throw Error("单项输出超过 8 MiB");
    size += bytes(v) + 1;
    if (size > LIMITS.outputBytes || out.length >= LIMITS.lines)
      throw Error("结果超过 8 MiB 或 50,000 项，请减少输入或扩展");
    out.push(v);
  };
  const replace = (line: string, re: RegExp | string, template: string) => {
    let length = line.length;
    return line.replace(re as RegExp, (...args: unknown[]) => {
      const match = String(args[0]);
      let value = template;
      if (typeof re !== "string") {
        const captures = args.slice(
          1,
          typeof args.at(-1) === "object" ? -3 : -2,
        );
        let measured = 0;
        const parts: string[] = [];
        let offset = 0;
        const token = /\$(\$|&|[1-9]\d?)/g;
        let found: RegExpExecArray | null;
        const add = (v: string) => {
          measured += v.length;
          if (measured > LIMITS.outputBytes) throw Error("替换结果超过 8 MiB");
          parts.push(v);
        };
        while ((found = token.exec(template))) {
          add(template.slice(offset, found.index));
          const key = found[1],
            n = Number(key);
          if (key === "$") add("$");
          else if (key === "&") add(match);
          else if (n <= captures.length) add(String(captures[n - 1] ?? ""));
          else if (key.length === 2 && Number(key[0]) <= captures.length)
            add(String(captures[Number(key[0]) - 1] ?? "") + key[1]);
          else add(found[0]);
          offset = found.index + found[0].length;
        }
        add(template.slice(offset));
        value = parts.join("");
      }
      length += value.length - match.length;
      if (length > LIMITS.outputBytes) throw Error("替换结果超过 8 MiB");
      return value;
    });
  };
  switch (s.type) {
    case "trim":
      for (const v of lines) push(v.trim());
      return out;
    case "nonempty":
      return lines.filter((v) => v.trim() !== "");
    case "dedupe": {
      const seen = new Set<string>();
      return lines.filter((v) => {
        const key = s.ignoreCase ? v.toLowerCase() : v;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    case "sort":
      return [...lines].sort(
        (a, b) => (a < b ? -1 : a > b ? 1 : 0) * (s.descending ? -1 : 1),
      );
    case "extract": {
      const re = regex(s.pattern, s.flags);
      for (const line of lines) {
        re.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(line))) {
          if (match[0] === "")
            throw Error("提取规则匹配了空文本，请调整正则，避免产生空项");
          const value = match[s.group ?? 0];
          if (value !== undefined) push(value);
          if (!re.global) break;
        }
      }
      return out;
    }
    case "replace": {
      const re =
        s.mode === "regex"
          ? regex(s.search, s.flags)
          : regex(s.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      for (const line of lines)
        push(
          replace(
            line,
            re,
            s.mode === "literal"
              ? s.replacement.replace(/\$/g, "$$$$")
              : s.replacement,
          ),
        );
      return out;
    }
    case "affix":
      for (const v of lines) push(s.prefix + v + s.suffix);
      return out;
    case "split":
      for (const line of lines) {
        let from = 0,
          index: number;
        while ((index = line.indexOf(s.separator, from)) !== -1) {
          push(line.slice(from, index));
          from = index + s.separator.length;
        }
        push(line.slice(from));
      }
      return out;
  }
}
function render(
  lines: string[],
  output: Recipe["output"],
  warnings: string[],
): string {
  switch (output.format) {
    case "text":
      return lines.join(output.separator ?? "\n");
    case "json":
      return JSON.stringify(lines, null, 2);
    case "sql-in":
      if (!lines.length)
        throw Error("SQL IN 不能使用空列表，请检查提取规则或选择其他格式");
      return `IN (${lines
        .map((value) => {
          if (value.includes("\0"))
            throw Error("SQL 字符串不能包含 NUL，请使用 JSON 输出和参数化查询");
          const v = value.replace(/'/g, "''");
          return value.includes("\\")
            ? `E'${v.replace(/\\/g, "\\\\")}'`
            : `'${v}'`;
        })
        .join(", ")})`;
    case "csv": {
      let protectedCount = 0;
      const text = lines
        .map((v) => {
          if (output.spreadsheetSafe !== false && /^[\s]*[=+\-@]/u.test(v)) {
            v = "'" + v;
            protectedCount++;
          }
          return v === "" || /[",\r\n]/.test(v)
            ? `"${v.replace(/"/g, '""')}"`
            : v;
        })
        .join("\r\n");
      if (protectedCount)
        warnings.push(
          `CSV 已对 ${protectedCount} 项添加文本前缀 '，防止被电子表格当作公式。需要原值时可关闭文本保护。`,
        );
      return text;
    }
  }
}
/** Internal synchronous engine. Run only inside a killable browser/Node Worker. */
export function executeRecipe(input: string, raw: unknown): Result {
  validateInput(input);
  const recipe = parseRecipe(raw),
    start = performance.now();
  let lines = input === "" ? [] : input.split(/\r\n|\n|\r/u);
  if (lines.at(-1) === "" && /[\r\n]$/.test(input)) lines.pop();
  bounded(lines);
  const inputLines = lines.length,
    trace: Result["trace"] = [];
  for (const [index, step] of recipe.steps.entries()) {
    const before = lines.length,
      at = performance.now();
    try {
      if (step.enabled !== false) lines = bounded(apply(lines, step));
    } catch (error) {
      throw Error(
        `第 ${index + 1} 步：${error instanceof Error ? error.message : "处理失败"}`,
      );
    }
    trace.push({
      index,
      type: step.type,
      enabled: step.enabled !== false,
      before,
      after: lines.length,
      ms: performance.now() - at,
    });
  }
  const warnings: string[] = [];
  if (inputLines > 0 && lines.length === 0)
    warnings.push("没有输出项。请检查提取规则，或载入当前模板的示例。");
  const text = render(lines, recipe.output, warnings),
    outputBytes = bytes(text);
  if (outputBytes > LIMITS.outputBytes)
    throw Error("输出超过 8 MiB，请减少输入或规则扩展");
  return {
    text,
    lines,
    trace,
    inputLines,
    outputLines: lines.length,
    inputBytes: bytes(input),
    outputBytes,
    ms: performance.now() - start,
    warnings,
    format: recipe.output.format,
  };
}
