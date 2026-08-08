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
