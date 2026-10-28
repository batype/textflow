# 发布素材草稿

一句话：TextFlow，把临时的文本处理，变成可以复用的规则。

15 秒演示：打开默认日志 → 看见 19 位 ID 完整保留 → 提取 5 项、去重为 3 项 → 切换 JSON / SQL IN → 导出规则 → 展示 CLI 使用同一份配置。

文案：

今天做了一个开发时能反复用到的小工具：TextFlow。粘贴日志或列表，提取字段、去空白、去重、批量替换，直接得到 JSON 数组、单列 CSV 或 PostgreSQL IN 片段。规则可以导出为 JSON，在网页、Node.js、CLI 和 AI 工作流里复用。输入在本地 Worker 中处理，长 ID 保持字符串，不需要登录或 API Key。

在线：https://batype.github.io/textflow/
源码：https://github.com/batype/textflow

尚未代用户发布到社交平台。使用频率和传播效果需要上线后通过真实反馈验证。
