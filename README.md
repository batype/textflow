# TextFlow · 让文本，有条理。

把日志、ID 列表和零散文本变成可直接使用的结果：提取 → 清理 → 去重 → 导出。网页在本地处理，同一套 JSON 规则可通过 Node.js API、CLI 和 AI skill 复用。

[在线工作台](https://batype.github.io/textflow/) · [项目接入](https://batype.github.io/textflow/#/guide) · [API / CLI](docs/api.md) · [规则格式](skills/textflow/references/recipes.md) · [AI skill](skills/textflow/SKILL.md)

![TextFlow](https://raw.githubusercontent.com/batype/textflow/main/docs/preview-light.png)

## 打开就用

- 五个快捷模板：日志取 ID、整理列表、生成 SQL IN、批量替换、提取字段。切换模板只替换规则，保留输入；载入示例由用户主动触发。
- 八种可组合步骤：trim、删除空行、去重、排序、正则提取、替换、前后缀、分隔符拆分。可启停、调整顺序；每一步显示输入/输出项数。
- 输出 JSON 字符串数组、文本列表、单列 CSV、PostgreSQL IN 字符串片段。长 ID 和前导零不转换为 number。
- 复制或下载结果、导入 UTF-8 文本、导入/导出规则 JSON、清空后 12 秒内撤销。默认配置留在表单中，JSON 仅在需要时查看。
- 亮色、暗色、跟随系统，支持手机布局。所有转换均在 Worker 中执行；复杂正则超时可终止并恢复工作。

例如：

```text
userId=1928374650123456789
userId=1928374650123456790
userId=1928374650123456789
```

使用“日志取 ID”得到：

```json
["1928374650123456789", "1928374650123456790"]
```

## Node API / CLI

```sh
npm install @batype/textflow
```

```js
import { runRecipe, presetRecipe } from "@batype/textflow";
const result = await runRecipe(
  "userId=001\nuserId=002\nuserId=001",
  presetRecipe("ids-json"),
);
console.log(result.text); // ["001", "002"]（带缩进）
```

```sh
npx --yes --package=@batype/textflow textflow --in input.log --preset ids-json --out ids.json --trace
npx --yes --package=@batype/textflow textflow --in input.txt --recipe textflow.recipe.json --out result.txt
```

Node.js 22.14+。没有运行时第三方 npm 依赖；API 和 CLI 的正则也在独立 Worker 中执行，默认超时 3 秒。CLI 不覆盖已有文件，拒绝输入或输出文件本身为符号链接，不执行文本里的 shell 或 JavaScript。详细参数和限制见 [API 文档](docs/api.md)。npm 的公开可用状态以 [npm 包页面](https://www.npmjs.com/package/@batype/textflow) 和 [Release](https://github.com/batype/textflow/releases) 为准；也可在源码中运行 `npm ci && npm run build:core` 后使用 `node bin/textflow.mjs`。

## 给 AI 使用

将仓库内的整个 `skills/textflow` 目录复制到 AI 客户端的 skills 目录。Codex 的个人目录通常为 `~/.codex/skills/textflow`。skill 自带规则格式参考，调用同一套 CLI，不另造处理规则。

```text
用 $textflow 提取 input.log 中的 userId，去重并保存为 JSON 字符串数组，保留原文件。
```

## 本地开发与部署

```sh
git clone https://github.com/batype/textflow.git
cd textflow
npm ci
npm test
npm run build
npm run dev
# http://127.0.0.1:4192/textflow/
```

React + Vite + TypeScript。业务核心在 `src/core`，Node Worker 在 `src/node`，浏览器 Worker 在 `src/workers`；网页组件不进入 Node API。`dist/` 和 `lib/` 是构建产物，不提交。GitHub Actions 在推送 main 后执行测试、构建与包检查，再部署 GitHub Pages；Vite base 为 `/textflow/`。

## 数据与使用边界

- 网页转换不使用远程接口、AI、分析脚本或 CDN。正式构建 CSP 禁止网络连接。只自动保存主题，输入与结果留在标签页内存；刷新前请下载需要的内容。清空撤销最多保留 12 秒。
- 规则 JSON 不包含输入文本，但匹配/替换/前后缀中可能有你填写的业务文字；分享前请核对。下载文件和系统剪贴板由用户主动操作。
- 输入上限 2 MiB、50,000 项；最多 12 步；中间和最终结果上限 8 MiB。超限报错，不静默截断。网页 Worker 超时 2 秒；Node 默认 3 秒，可调整到最多 10 秒。
- JavaScript 正则按行匹配，仅支持 g/i/m/s/u；不是 PCRE、Python 正则或完整日志解析器。没有跨行提取。排序为字符顺序；大小写比较不进行 Unicode 规范化。
- CSV 为单列，默认给可能被电子表格识别为公式的值添加 apostrophe 文本前缀；关闭“电子表格文本保护”可保留原值。JSON 始终保留原始字符串。
- SQL 输出面向 PostgreSQL 字符串片段，不执行数据库操作，也不代替应用的参数化查询。JSON 数组也不会执行、修复或解析输入中的 JavaScript。

验证记录见 [docs/validation.md](docs/validation.md)。问题请使用合成示例提交到 [Issues](https://github.com/batype/textflow/issues)。

MIT © 2026 batype。
