---
role: layout-tool-boundary
---

# Resume Formatter Agent Boundary

本仓库是简历排版工具。Agent 在这里负责解析、渲染、A4 测量、视觉参数、HTML 快照与 PDF 导出。

## 与 GraceOS 的职责边界

当输入来自 GraceOS 时，以下内容由 GraceOS 的 Interview Skill 和简历系统管理：

- 项目事实、教育与经历事实；
- `Resume-Master`、版本 Brief 与 JD 匹配；
- Bullet 的选材、排序、措辞、Ownership、指标与技术边界；
- 内容母版、单岗冻结版与人工审核状态。

本仓库只管理：

- Markdown / JSON Schema 的解析与校验；
- A4 页面、换行、溢出高度、字号、行高、间距与布局；
- HTML 排版快照和 PDF 派生文件；
- 可供内容侧判断的版面诊断。

## 内容处理规则

1. 将导入的 Markdown 视为已确认输入。Agent 不润色、不压缩、不重排事实，也不根据 JD 改写正文。
2. 浏览器内联编辑只属于当前排版草稿。它不会自动回写 GraceOS、`Resume-Master`、版本 Brief 或源 Markdown。
3. A4 溢出优先通过已支持的视觉参数处理，同时遵守可读性下限。需要删减文字时停止自动处理，向内容侧返回诊断。
4. 版面诊断至少包含：总溢出高度、发生换行的条目、预计需要减少的行数，以及已尝试的视觉参数。
5. Agent 不覆盖来源 Markdown、General 基准 PDF 或任何单岗冻结版。

## 隐私与公开发布红线

本仓库及其 GitHub Pages 均按公开资产处理。真实简历可以在浏览器本地导入和排版，但不得成为仓库内容或公开构建输入。

1. 不得将真实姓名、电话、邮箱、学校、公司、项目指标、简历正文、个人网页地址，以及源 Markdown / JSON 写入任何被 Git 跟踪的源码、fixture、测试、文档、截图、提交记录或生成 HTML。
2. 默认模板、测试样例和 Pages 构建只能使用 `fixtures/valid/sample-resume.md` 或其他明确虚构、已匿名的数据。
3. 真实简历只允许通过浏览器本地文件或文件夹导入；文件句柄、最近打开记录和浏览器内联编辑不得转化为仓库构建输入。
4. 本地导出的真实 PDF / HTML 不得复制到本仓库内，也不得进入 `dist/` 或 Git 提交。
5. 提交、推送或部署前，必须检查 `index.html`、`resume-formatter.html`、`dist/`、fixtures、测试、文档和截图中是否出现真实个人标识；Pages 发布前必须从匿名样例重新构建。
6. 如果任务要求把真实简历内容写入本仓库或 Git 历史，Agent 必须停止该写入，并将真源和本地派生文件留在 GraceOS 或其他不公开的本地目录。

## GraceOS 当前交接约定

- General AIPM 视觉基准：`Grace OS/02-秋招 2026/0-CV/CV-Ai产品.pdf`
- AIPM 内容母版：`Grace OS/02-秋招 2026/0-CV/简历系统/resume-aipm-v2.md`
- 每段实习保留独立的一行 OKR；具体项目 Bullet 的数量、顺序和篇幅由 GraceOS 根据真实 JD 决定。
- 排版器收到新版本后重新测量和导出，不自行合并 General、母版与单岗版本。

## 回传格式

```text
输入版本：
页面状态：正常 / 溢出 X mm
换行位置：
已尝试的排版调整：
仍需减少：约 X 行
内容侧待决策：
```
