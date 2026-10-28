import { useEffect, useMemo, useRef, useState } from "react";
import { PRESETS, presetRecipe } from "./core/presets.js";
import { defaultStep, parseRecipe } from "./core/validate.js";
import {
  LIMITS,
  STEP_NAMES,
  type Recipe,
  type Step,
  type Format,
  type Result,
} from "./core/model.js";
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const units = (n: number) =>
  n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KiB`;
function download(text: string, name: string, type = "text/plain") {
  const url = URL.createObjectURL(
    new Blob([text], { type: `${type};charset=utf-8` }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function readTheme() {
  try {
    return localStorage.getItem("textflow:theme") ?? "system";
  } catch {
    return "system";
  }
}
export default function App() {
  const [selected, setSelected] = useState("ids-json"),
    [input, setInput] = useState(PRESETS[0].input),
    [recipe, setRecipe] = useState<Recipe>(() => presetRecipe("ids-json"));
  const [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [theme, setTheme] = useState(readTheme),
    [route, setRoute] = useState(location.hash),
    [source, setSource] = useState("内置示例");
  const [configText, setConfigText] = useState(""),
    [configError, setConfigError] = useState(""),
    [undo, setUndo] = useState<{ input: string; source: string } | null>(null),
    [revision, setRevision] = useState(0);
  const worker = useRef<Worker | null>(null),
    serial = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    dialog = useRef<HTMLDialogElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    configFile = useRef<HTMLInputElement>(null),
    inputEditor = useRef<HTMLTextAreaElement>(null);
  const state = useMemo(() => JSON.stringify([input, recipe]), [input, recipe]),
    [completed, setCompleted] = useState("");
  const ready = Boolean(result) && completed === state && !busy && !error;
  const preset = PRESETS.find((p) => p.id === selected)!;
  useEffect(() => {
    const listener = () => setRoute(location.hash);
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    apply();
    media.addEventListener("change", apply);
    try {
      localStorage.setItem("textflow:theme", theme);
    } catch {}
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    const id = ++serial.current;
    setBusy(true);
    setError("");
    const delay = setTimeout(() => {
      const current = new Worker(
        new URL("./workers/transform.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = current;
      timer.current = setTimeout(() => {
        if (id !== serial.current) return;
        current.terminate();
        worker.current = null;
        setBusy(false);
        setError(
          "处理超时，已终止 Worker。请简化正则或减少输入，再修改规则重试。",
        );
      }, 2000);
      current.onmessage = ({ data }) => {
        if (id !== serial.current) return;
        if (timer.current) clearTimeout(timer.current);
        current.terminate();
        worker.current = null;
        setBusy(false);
        if (data.error) {
          setError(data.error);
          return;
        }
        setResult(data.result);
        setCompleted(state);
      };
      current.onerror = () => {
        if (id !== serial.current) return;
        if (timer.current) clearTimeout(timer.current);
        current.terminate();
        worker.current = null;
        setBusy(false);
        setError("处理 Worker 运行失败，请减少输入后重试。");
      };
      current.postMessage({ id, input, recipe });
    }, 200);
    return () => {
      clearTimeout(delay);
      if (timer.current) clearTimeout(timer.current);
      worker.current?.terminate();
      worker.current = null;
    };
  }, [state, revision]);
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 12000);
    return () => clearTimeout(id);
  }, [undo]);
  useEffect(() => {
    document.title = route.startsWith("#/guide")
      ? "项目接入 · TextFlow"
      : "TextFlow · 让文本，有条理。";
    if (route === "#workbench")
      document.getElementById("workbench")?.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0 });
  }, [route]);
  const changeRecipe = (next: Recipe) => {
    setRecipe(next);
    setNotice("");
  };
  const update = (index: number, patch: Partial<Step>) =>
    changeRecipe({
      ...recipe,
      steps: recipe.steps.map((s, i) =>
        i === index ? ({ ...s, ...patch } as Step) : s,
      ),
    });
  const move = (i: number, direction: number) => {
    const steps = [...recipe.steps];
    [steps[i], steps[i + direction]] = [steps[i + direction], steps[i]];
    changeRecipe({ ...recipe, steps });
  };
  const selectPreset = (id: string) => {
    setSelected(id);
    changeRecipe(presetRecipe(id));
    setNotice("处理规则已切换，输入文本保留。可点击“载入示例”体验当前模板。");
  };
  const sample = () => {
    if (
      input !== PRESETS.find((p) => p.input === input)?.input &&
      input.trim() &&
      !confirm("载入示例会替换当前输入。继续吗？")
    )
      return;
    setInput(preset.input);
    setSource("内置示例");
    setUndo(null);
    setNotice("已载入合成示例。");
  };
  const clear = () => {
    if (input) setUndo({ input, source });
    setInput("");
    setSource("空白输入");
    setNotice("输入已清空。");
  };
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label}已复制`);
    } catch {
      setNotice("复制失败，请手动选择文本复制。");
    }
  };
  const openConfig = () => {
    setConfigText(pretty(recipe));
    setConfigError("");
    dialog.current?.showModal();
  };
  const applyConfig = () => {
    try {
      changeRecipe(parseRecipe(configText));
      setConfigError("");
      dialog.current?.close();
      setNotice("配置已应用，输入文本保留。");
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : "配置无效");
    }
  };
  const importText = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > LIMITS.inputBytes) throw Error("文件最大 2 MiB");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      setInput(text);
      setSource(file.name);
      setUndo(null);
      setNotice("文件已在本地读入。");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "请选择 UTF-8 文本文件");
    }
  };
  const importConfig = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 65536) throw Error("配置最大 64 KiB");
      const config = parseRecipe(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await file.arrayBuffer(),
        ),
      );
      setConfigText(pretty(config));
      changeRecipe(config);
      setConfigError("");
      setNotice("规则已导入，输入文本保留。");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "配置导入失败");
    }
  };
  const exportResult = () => {
    if (!ready || !result) return;
    download(
      result.text,
      `textflow-result.${({ text: "txt", json: "json", csv: "csv", "sql-in": "sql" } as const)[result.format]}`,
      result.format === "json"
        ? "application/json"
        : result.format === "csv"
          ? "text/csv"
          : "text/plain",
    );
    setNotice("结果已下载。");
  };
  const replaceInput = () => {
    if (!ready || !result) return;
    setInput(result.text);
    setSource("上次处理结果");
    setNotice("结果已作为新输入；现有规则会再次应用。");
  };
  const guide = route.startsWith("#/guide");
  const fields = (step: Step, i: number) => {
    const textField = (
      key: string,
      label: string,
      value: string,
      hint?: string,
    ) => (
      <label>
        {label}
        <input
          value={value}
          spellCheck={false}
          maxLength={key === "pattern" || key === "search" ? 1000 : 2000}
          onChange={(e) =>
            update(i, { [key]: e.target.value } as Partial<Step>)
          }
        />
        {hint && <small>{hint}</small>}
      </label>
    );
    const flagField = (value: string | undefined) =>
      textField(
        "flags",
        "Flags",
        value ?? "g",
        "支持 g i m s u，不执行其他语言正则",
      );
    switch (step.type) {
      case "extract":
        return (
          <>
            {textField(
              "pattern",
              "正则表达式",
              step.pattern,
              "按行匹配；不需要两侧的 /",
            )}
            <div className="field-pair">
              {flagField(step.flags)}
              <label>
                捕获组
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={step.group ?? 0}
                  onChange={(e) => update(i, { group: Number(e.target.value) })}
                />
                <small>0 为完整匹配</small>
              </label>
            </div>
          </>
        );
      case "replace":
        return (
          <>
            <label>
              匹配方式
              <select
                value={step.mode}
                onChange={(e) =>
                  update(i, { mode: e.target.value as "literal" | "regex" })
                }
              >
                <option value="literal">普通文字（全部替换）</option>
                <option value="regex">正则表达式</option>
              </select>
            </label>
            {textField("search", "查找", step.search)}
            {textField(
              "replacement",
              "替换为",
              step.replacement,
              step.mode === "regex"
                ? "支持 $1…$99、$&、$$"
                : "按字面内容替换，$1 也会原样保留",
            )}
            {step.mode === "regex" && flagField(step.flags)}
          </>
        );
      case "affix":
        return (
          <>
            {textField("prefix", "前缀", step.prefix)}
            {textField("suffix", "后缀", step.suffix)}
          </>
        );
      case "split":
        return textField(
          "separator",
          "分隔符",
          step.separator,
          "按普通文字拆分，不按正则解析",
        );
      case "dedupe":
        return (
          <label className="check">
            <input
              type="checkbox"
              checked={step.ignoreCase ?? false}
              onChange={(e) => update(i, { ignoreCase: e.target.checked })}
            />
            忽略大小写；保留首次出现的原文
          </label>
        );
      case "sort":
        return (
          <label>
            排序方式
            <select
              value={step.descending ? "desc" : "asc"}
              onChange={(e) =>
                update(i, { descending: e.target.value === "desc" })
              }
            >
              <option value="asc">升序 · 字符顺序</option>
              <option value="desc">降序 · 字符顺序</option>
            </select>
            <small>不转换为数字，长 ID 保持字符串</small>
          </label>
        );
      default:
        return (
          <p className="muted">
            {step.type === "trim"
              ? "删除每项首尾的 Unicode 空白，不修改中间内容。"
              : "移除仅包含空白的项，保留其他原文。"}
          </p>
        );
    }
  };
  return (
    <>
      <a className="skip" href="#main">
        跳到主要内容
      </a>
      <input
        hidden
        type="file"
        ref={fileInput}
        accept=".txt,.log,.csv,.json,text/*"
        onChange={(e) => {
          void importText(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        hidden
        type="file"
        ref={configFile}
        accept=".json,application/json"
        onChange={(e) => {
          void importConfig(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <header className="topbar">
        <a className="brand" href="#/workbench">
          <img
            src={`${import.meta.env.BASE_URL}icon.svg`}
            width="34"
            height="34"
            alt=""
          />
          <strong>
            TextFlow<span> / 文本工作台</span>
          </strong>
        </a>
        <nav aria-label="主导航">
          <a href="#workbench" aria-current={!guide ? "page" : undefined}>
            工作台
          </a>
          <a href="#/guide" aria-current={guide ? "page" : undefined}>
            项目接入
          </a>
          <a
            href="https://github.com/batype/textflow"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </nav>
        <label className="theme">
          <span className="sr-only">界面主题</span>
          <select
            aria-label="界面主题"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="system">跟随系统</option>
            <option value="light">亮色模式</option>
            <option value="dark">暗色模式</option>
          </select>
        </label>
      </header>
      {guide ? (
        <main id="main" className="guide" tabIndex={-1}>
          <a className="back" href="#/workbench">
            ← 返回工作台
          </a>
          <p className="eyebrow">ONE RECIPE. EVERYWHERE.</p>
          <h1>
            处理一次，<em>以后复用。</em>
          </h1>
          <p>
            网页、Node.js 与 CLI 使用同一套规则。先导出规则
            JSON，再在工程中运行；输入文本不进入规则配置。
          </p>
          <section>
            <span className="section-number">01</span>
            <h2>安装与首次调用</h2>
            <p>
              Node.js 22.14+，无需 React，也不需要 API Key。正则在独立 Worker
              里执行，默认超时 3 秒。
            </p>
            <p className="warning">
              npm 公开状态以{" "}
              <a
                href="https://github.com/batype/textflow/releases"
                target="_blank"
                rel="noreferrer"
              >
                Release 页面
              </a>{" "}
              为准。若注册表尚未公开，可下载已验证的 tgz 安装包，使用{" "}
              <code>npm install ./batype-textflow-1.0.0.tgz</code>。以下 npm
              命令适用于正式发布后。
            </p>
            <pre
              tabIndex={0}
            >{`npm install @batype/textflow\n\nimport { runRecipe, presetRecipe } from '@batype/textflow';\n\nconst result = await runRecipe(\n  'userId=10001\\nuserId=10002\\nuserId=10001',\n  presetRecipe('ids-json'),\n);\nconsole.log(result.text); // ["10001", "10002"]（带缩进）`}</pre>
            <button
              onClick={() =>
                void copy("npm install @batype/textflow", "安装命令")
              }
            >
              复制安装命令
            </button>
            <p role="status" className="notice">
              {notice}
            </p>
          </section>
          <section>
            <span className="section-number">02</span>
            <h2>用当前规则处理文件</h2>
            <p>
              下载规则文件，与输入文件一起放到工作目录。CLI
              默认不覆盖已有文件，未指定 --out 时输出到 stdout。
            </p>
            <button
              onClick={() =>
                download(
                  pretty(recipe),
                  "textflow.recipe.json",
                  "application/json",
                )
              }
            >
              ↓ 下载当前规则
            </button>
            <pre
              tabIndex={0}
            >{`npx --yes --package=@batype/textflow textflow \\\n  --in input.txt \\\n  --recipe textflow.recipe.json \\\n  --out result.txt --trace\n\n# 使用内置模板\nnpx --yes --package=@batype/textflow textflow \\\n  --in input.log --preset ids-json --out ids.json`}</pre>
            <p>
              --trace 仅把步骤计数与耗时写到
              stderr；原文不会写入这份处理报告。文件按 UTF-8 严格读取，输入最多
              2 MiB、50,000 项。
            </p>
          </section>
          <section>
            <span className="section-number">03</span>
            <h2>给 AI 使用</h2>
            <p>
              仓库内提供 <code>skills/textflow</code>。将整个目录复制到 AI
              客户端的 skills 目录，skill 会指导 AI 使用同一套
              CLI、检查处理计数并保护原始文件。
            </p>
            <a
              className="button"
              href="https://github.com/batype/textflow/tree/main/skills/textflow"
              target="_blank"
              rel="noreferrer"
            >
              查看 AI skill ↗
            </a>
            <pre tabIndex={0}>
              用 $textflow 从 input.log 提取 userId，去重并保存为 JSON
              字符串数组。保留原文件。
            </pre>
          </section>
          <section>
            <h2>格式和边界</h2>
            <p>
              正则为 JavaScript 引擎，按行处理，不支持跨行提取。JSON
              数组的每一项都是字符串。CSV
              为单列，默认对可能被当作公式的项加文本前缀。SQL IN 面向 PostgreSQL
              字符串，只生成片段，不连接数据库；实际查询建议使用参数化执行。
            </p>
            <p>
              仅主题偏好自动保存。输入和结果保留在当前标签页内存，刷新前请下载需要的内容。规则配置不包含输入文本，但可能含你填写的匹配或替换文字，分享前请检查。
            </p>
          </section>
        </main>
      ) : (
        <main id="main" tabIndex={-1}>
          <section className="hero">
            <div>
              <p className="eyebrow">
                <span className="tiny-dot" /> A LITTLE ORDER, A LOT LESS WORK.
              </p>
              <h1>
                零散文本，
                <br />
                一步步<em>理清。</em>
              </h1>
              <p className="hero-copy">
                从日志里的 ID，到可以直接使用的数组。
                <br />
                提取、清理、去重，让重复操作变成一条规则。
              </p>
              <div className="hero-pills">
                <span>↳ 浏览器本地处理</span>
                <span>无需登录</span>
                <span>长 ID 不丢精度</span>
                <a className="quick-start" href="#workbench">
                  开始处理 ↓
                </a>
              </div>
            </div>
            <div className="hero-note" aria-label="处理示意">
              <div className="note-top">
                <span>示例 / LESS NOISE. MORE SIGNAL.</span>
                <span>↘</span>
              </div>
              <div className="mini-flow">
                <span>
                  原始文本<b>06</b>
                </span>
                <i>→</i>
                <span>
                  提取字段<b>05</b>
                </span>
                <i>→</i>
                <span className="mini-result">
                  去重结果<b>03</b>
                </span>
              </div>
              <div className="note-bottom">
                <span className="tiny-dot" /> 一段文本，一套可复用的处理步骤。
              </div>
            </div>
          </section>
          <section className="preset-section" aria-label="快捷模板">
            <div className="section-label">
              <span>从一个常用任务开始</span>
              <small>QUICK RECIPES / 05</small>
            </div>
            <div className="presets">
              {PRESETS.map((p, i) => (
                <button
                  className={`preset ${selected === p.id ? "active" : ""}`}
                  key={p.id}
                  aria-pressed={selected === p.id}
                  onClick={() => selectPreset(p.id)}
                >
                  <span className="preset-symbol">{p.symbol}</span>
                  <span>
                    <strong>{p.title}</strong>
                    <small>{p.description}</small>
                  </span>
                  <span className="preset-index">0{i + 1}</span>
                </button>
              ))}
            </div>
          </section>
          <section
            className="workbench"
            id="workbench"
            aria-label="文本处理工作台"
          >
            <div className="bench-top">
              <div>
                <span className="tiny-dot" />
                <strong>文本工作台</strong>
                <span className="status">
                  {busy
                    ? "正在处理…"
                    : error
                      ? "请检查规则"
                      : ready
                        ? "结果已更新"
                        : "等待输入"}
                </span>
              </div>
              <div className="bench-actions">
                <button onClick={sample}>载入示例</button>
                <button onClick={() => fileInput.current?.click()}>
                  导入文本
                </button>
                <button onClick={clear}>清空</button>
              </div>
            </div>
            <div className="work-grid">
              <section className="pane input-pane">
                <div className="pane-head">
                  <h2>
                    <span>01</span> 原始文本
                  </h2>
                  <span className="source">{source}</span>
                </div>
                <label className="sr-only" htmlFor="source-input">
                  原始文本
                </label>
                <textarea
                  ref={inputEditor}
                  id="source-input"
                  value={input}
                  spellCheck={false}
                  placeholder="粘贴日志、ID 列表或待处理的文本…"
                  onChange={(e) => {
                    if (e.target.value.length > LIMITS.inputBytes) {
                      setNotice("输入超过 2 MiB 字符上限，请缩小后重试。");
                      return;
                    }
                    setInput(e.target.value);
                    setSource("粘贴 / 手动编辑");
                    setUndo(null);
                  }}
                />
                <div className="pane-foot">
                  <span>
                    UTF-8 · {units(new TextEncoder().encode(input).length)} / 2
                    MiB
                  </span>
                  <span>文本不会上传 ↗</span>
                </div>
              </section>
              <section className="pane recipe-pane">
                <div className="pane-head">
                  <h2>
                    <span>02</span> 处理步骤
                  </h2>
                  <button className="text-button" onClick={openConfig}>
                    查看配置
                  </button>
                </div>
                <div className="steps">
                  {recipe.steps.map((step, i) => {
                    const trace = ready ? result?.trace[i] : undefined;
                    return (
                      <div
                        className={`step ${step.enabled === false ? "disabled" : ""}`}
                        key={i}
                      >
                        <div className="step-top">
                          <label className="step-enabled">
                            <input
                              type="checkbox"
                              checked={step.enabled !== false}
                              aria-label={`启用第 ${i + 1} 步`}
                              onChange={(e) =>
                                update(i, { enabled: e.target.checked })
                              }
                            />
                            <span>{String(i + 1).padStart(2, "0")}</span>
                          </label>
                          <strong>{STEP_NAMES[step.type]}</strong>
                          <span className="step-count">
                            {trace ? `${trace.before} → ${trace.after}` : "—"}
                          </span>
                        </div>
                        <div className="step-summary">
                          <span>
                            {step.type === "extract"
                              ? step.pattern
                              : step.type === "dedupe"
                                ? "保持首次出现的顺序"
                                : step.type === "trim"
                                  ? "去除首尾空白"
                                  : step.type === "nonempty"
                                    ? "跳过纯空白项"
                                    : step.type === "replace"
                                      ? `${step.search} → ${step.replacement}`
                                      : step.type === "affix"
                                        ? `${step.prefix}文本${step.suffix}`
                                        : step.type === "sort"
                                          ? "字符顺序"
                                          : `按 ${step.separator} 拆分`}
                          </span>
                        </div>
                        <details>
                          <summary>调整规则</summary>
                          <div className="step-fields">{fields(step, i)}</div>
                        </details>
                        <div className="step-actions">
                          <button
                            disabled={i === 0}
                            aria-label={`上移第 ${i + 1} 步`}
                            onClick={() => move(i, -1)}
                          >
                            ↑
                          </button>
                          <button
                            disabled={i === recipe.steps.length - 1}
                            aria-label={`下移第 ${i + 1} 步`}
                            onClick={() => move(i, 1)}
                          >
                            ↓
                          </button>
                          <button
                            className="remove-step"
                            aria-label={`删除第 ${i + 1} 步`}
                            onClick={() =>
                              changeRecipe({
                                ...recipe,
                                steps: recipe.steps.filter((_, j) => j !== i),
                              })
                            }
                          >
                            移除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <label className="add-step">
                    <span>＋ 添加处理步骤</span>
                    <select
                      aria-label="添加处理步骤"
                      value=""
                      disabled={recipe.steps.length >= LIMITS.steps}
                      onChange={(e) => {
                        if (e.target.value)
                          changeRecipe({
                            ...recipe,
                            steps: [
                              ...recipe.steps,
                              defaultStep(e.target.value as Step["type"]),
                            ],
                          });
                      }}
                    >
                      <option value="">选择一个步骤</option>
                      {Object.entries(STEP_NAMES).map(([type, name]) => (
                        <option key={type} value={type}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="recipe-foot">
                    <span>
                      {recipe.steps.filter((s) => s.enabled !== false).length}{" "}
                      个启用步骤 / 最多 12 步
                    </span>
                    <button
                      className="text-button"
                      onClick={() => configFile.current?.click()}
                    >
                      导入规则
                    </button>
                  </div>
                </div>
              </section>
              <section className="pane output-pane">
                <div className="pane-head">
                  <h2>
                    <span>03</span> 处理结果
                  </h2>
                  <label className="format-picker">
                    <span className="sr-only">输出格式</span>
                    <select
                      aria-label="输出格式"
                      value={recipe.output.format}
                      onChange={(e) =>
                        changeRecipe({
                          ...recipe,
                          output: {
                            ...recipe.output,
                            format: e.target.value as Format,
                          },
                        })
                      }
                    >
                      <option value="json">JSON 数组</option>
                      <option value="text">文本列表</option>
                      <option value="csv">CSV · 单列</option>
                      <option value="sql-in">SQL IN · PostgreSQL</option>
                    </select>
                  </label>
                </div>
                <div className="output-body">
                  {error ? (
                    <div className="error-box" role="alert">
                      <b>这一步需要调整</b>
                      <p>{error}</p>
                      <button onClick={() => setRevision((v) => v + 1)}>
                        重新处理
                      </button>
                    </div>
                  ) : (
                    <>
                      <label className="sr-only" htmlFor="result-output">
                        处理结果
                      </label>
                      <textarea
                        id="result-output"
                        readOnly
                        aria-busy={busy}
                        value={
                          result && ready
                            ? result.text
                            : busy
                              ? "正在本地处理…"
                              : ""
                        }
                        placeholder="处理结果会出现在这里"
                        spellCheck={false}
                      />
                      {!input && (
                        <span className="empty-label">
                          从左侧粘贴一段文本开始。
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="output-options">
                  {recipe.output.format === "text" && (
                    <label>
                      连接分隔符
                      <input
                        aria-label="输出连接分隔符"
                        value={(recipe.output.separator ?? "\n")
                          .replace(/\n/g, "\\n")
                          .replace(/\t/g, "\\t")}
                        onChange={(e) =>
                          changeRecipe({
                            ...recipe,
                            output: {
                              ...recipe.output,
                              separator: e.target.value
                                .replace(/\\n/g, "\n")
                                .replace(/\\t/g, "\t"),
                            },
                          })
                        }
                        placeholder="\\n"
                      />
                    </label>
                  )}
                  {recipe.output.format === "csv" && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={recipe.output.spreadsheetSafe !== false}
                        onChange={(e) =>
                          changeRecipe({
                            ...recipe,
                            output: {
                              ...recipe.output,
                              spreadsheetSafe: e.target.checked,
                            },
                          })
                        }
                      />
                      电子表格文本保护
                    </label>
                  )}
                  {recipe.output.format === "sql-in" && (
                    <p>PostgreSQL 字符串片段。只生成文本，不连接数据库。</p>
                  )}
                  {recipe.output.format === "json" && (
                    <p>所有值按字符串输出，长 ID 保持原样。</p>
                  )}
                </div>
                <div className="output-actions">
                  <button
                    className="primary"
                    disabled={!ready}
                    onClick={() =>
                      ready && result && void copy(result.text, "处理结果")
                    }
                  >
                    <span>▣</span> 复制结果
                  </button>
                  <button disabled={!ready} onClick={exportResult}>
                    ↓ 下载
                  </button>
                  <button
                    className="icon-button"
                    aria-label="结果作为新输入"
                    title="结果作为新输入"
                    disabled={!ready}
                    onClick={replaceInput}
                  >
                    ↶
                  </button>
                </div>
                <div className="pane-foot">
                  <span>
                    {ready
                      ? `${result?.outputLines} 项 · ${units(result?.outputBytes ?? 0)}`
                      : "结果待更新"}
                  </span>
                  <span>
                    {ready ? `${(result?.ms ?? 0).toFixed(1)} ms` : "—"}
                  </span>
                </div>
              </section>
            </div>
            <div className="bench-bottom">
              <span className="processed-summary">
                {ready ? (
                  <>
                    <b>{result?.inputLines}</b> 行输入 <span>→</span>{" "}
                    <b>{result?.outputLines}</b> 项结果
                  </>
                ) : error ? (
                  "请调整规则后重试"
                ) : (
                  "每次修改都会自动处理"
                )}
              </span>
              <span>只记住主题偏好；刷新前请下载需要的内容。</span>
              {busy && (
                <button
                  onClick={() => {
                    serial.current++;
                    worker.current?.terminate();
                    worker.current = null;
                    if (timer.current) clearTimeout(timer.current);
                    setBusy(false);
                    setError(
                      "处理已取消。修改输入、规则或点击重新处理以继续。",
                    );
                  }}
                >
                  取消处理
                </button>
              )}
            </div>
          </section>
          <div className="notice" role="status">
            {notice}
            {undo && (
              <button
                onClick={() => {
                  setInput(undo.input);
                  setSource(undo.source);
                  setUndo(null);
                  setNotice("已恢复清空前的输入。");
                }}
              >
                撤销清空（12 秒）
              </button>
            )}
          </div>
          {ready &&
            result?.warnings.map((message) => (
              <p className="warning" role="status" key={message}>
                {message}
              </p>
            ))}
          <section className="reuse">
            <div>
              <p className="eyebrow">MAKE IT REPEATABLE.</p>
              <h2>
                今天清理文本，
                <br />
                <em>明天复用规则。</em>
              </h2>
              <p>
                把处理步骤保存为 JSON，在 Node.js、命令行或 AI
                工作流里，得到同样的结果。
              </p>
            </div>
            <div className="reuse-code">
              <div>
                <span>terminal</span>
                <span>RULES, NOT REPETITION.</span>
              </div>
              <pre>{`textflow --in input.log \\\n  --recipe textflow.recipe.json \\\n  --out ids.json`}</pre>
              <a href="#/guide">查看安装与使用步骤 →</a>
            </div>
          </section>
        </main>
      )}
      <footer>
        <a className="footer-brand" href="#/workbench">
          TextFlow <span>让文本，有条理。</span>
        </a>
        <span>React + Vite · MIT · 本地处理</span>
        <a
          href="https://github.com/batype/textflow/issues"
          target="_blank"
          rel="noreferrer"
        >
          反馈与建议 ↗
        </a>
      </footer>
      <dialog
        ref={dialog}
        className="config-dialog"
        aria-labelledby="config-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="dialog-head">
          <div>
            <p className="eyebrow">REUSABLE RECIPE</p>
            <h2 id="config-title">一份配置，到处复用。</h2>
          </div>
          <button aria-label="关闭配置" onClick={() => dialog.current?.close()}>
            ×
          </button>
        </div>
        <p>
          这里保存处理规则，不包含输入文本。匹配和替换文字仍可能含业务信息，分享前请检查。
        </p>
        <label className="sr-only" htmlFor="recipe-json">
          规则 JSON
        </label>
        <textarea
          id="recipe-json"
          spellCheck={false}
          value={configText}
          onChange={(e) => {
            if (e.target.value.length > 65536) {
              setConfigError("配置最大 64 KiB，请缩小规则");
              return;
            }
            setConfigText(e.target.value);
          }}
        />
        {configError && (
          <p className="config-error" role="alert">
            {configError}
          </p>
        )}
        <div className="dialog-actions">
          <button
            onClick={() => {
              try {
                const r = parseRecipe(configText);
                download(pretty(r), "textflow.recipe.json", "application/json");
                setNotice("规则已导出。");
              } catch (e) {
                setConfigError(e instanceof Error ? e.message : "规则无效");
              }
            }}
          >
            ↓ 导出规则
          </button>
          <button
            onClick={() => {
              try {
                void copy(pretty(parseRecipe(configText)), "规则配置");
              } catch (e) {
                setConfigError(e instanceof Error ? e.message : "规则无效");
              }
            }}
          >
            复制配置
          </button>
          <button className="primary" onClick={applyConfig}>
            应用配置
          </button>
        </div>
      </dialog>
    </>
  );
}
