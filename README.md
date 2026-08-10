# Resume Formatter

一个本地运行的 Markdown 简历排版器。将符合固定格式的 Markdown 简历转换为可编辑 HTML，并导出单页 A4 PDF。

**[在线使用 →](https://gracexygu.github.io/resume-formatter/)**

---

## 核心理念

```
已经写好的简历.md
      ↓
可继续编辑的简历.html
      ↓
用于投递的简历.pdf
```

- Markdown 是内容输入
- HTML 是可编辑、可存档的排版版本
- PDF 是最终投递文件

所有操作在浏览器本地完成，**不上传任何数据**。

### 与 GraceOS 协作

在 GraceOS 简历工作流中，本工具作为外接排版工具使用：

- GraceOS 管理事实真源、JD 匹配、正文取舍和版本冻结；
- Resume Formatter 读取已确认的 Markdown，负责 A4 测量、视觉调整与 HTML / PDF 导出；
- 浏览器内的文字编辑只形成当前排版草稿，不自动回写 GraceOS 或源 Markdown；
- 内容超出一页且视觉参数无法继续压缩时，工具返回溢出高度、换行位置和建议减少的行数，由内容侧决定删改。

完整 Agent 边界见 [`AGENTS.md`](AGENTS.md)。

---

## 功能

- **导入 Markdown** — 支持中英文栏目名，自动校验并定位错误
- **两套排版风格** — A/B 随时切换，同一份 MD 即时预览不同风格
- **直接编辑** — 点击任意文字即可修改，无需回到 Markdown 文件
- **Bullet / 条目增删** — 悬停出现 `+` 和 `×` 控件
- **证件照** — 上传、拖动、缩放，随 HTML 一起保存
- **A4 溢出检测** — 实时标记超出位置和大致高度
- **另存为 HTML** — 导出的 HTML 包含完整编辑能力，可独立打开
- **导出 PDF** — 通过浏览器打印（推荐 Chrome）
- **简历目录面板** — 选择本地目录，只列出可通过简历 Schema 校验的 Markdown 和 JSON 文件，点击切换
- **新增简历** — 下载空白 Schema v1 模板

---

## 快速开始

### 在线版（推荐）

直接访问 [GitHub Pages](https://gracexygu.github.io/resume-formatter/)，无需任何安装。

### 本地版

1. 下载 `dist/resume-formatter.html`
2. 双击在 Chrome 中打开
3. 点击「导入 MD」，选择你的简历文件

---

## Markdown 格式（Schema v1）

```markdown
---
schema_version: 1
resume_name: 示例科技-产品经理
name: 姓名
headline: AI 产品经理
location: 上海
phone: 18012345678
email: you@email.com
---

## 教育经历

### 示例大学
role: 信息管理｜硕士
date: 2024.09–2027.06
location: 上海

- 主修产品与数据分析

## 实习经历

### 示例科技｜产品部
role: 产品实习生
date: 2026.04–2026.08
location: 杭州

- 负责**核心策略**迭代

## 项目经历

### 项目名称
role: 产品负责人
date: 2026.05–2026.07

- 项目描述

## 技能

- 产品：用户研究、策略设计
- AI：Prompt、Context、Evals
```

Bullet 支持 `**加粗**`、`*斜体*` 和 `[链接名称](https://example.com)`；也可选中文字后通过工具栏添加、编辑或移除链接。

**栏目支持中英文：**

| 中文 | 英文 |
|------|------|
| 教育经历 | education |
| 实习经历 / 工作经历 | experience |
| 项目经历 | projects |
| 技能 | skills |

---

## 目录面板使用

1. 点击右侧面板 📂 按钮，选择存放 Markdown 简历的本地目录
2. 目录下仅列出能通过当前简历 Schema 解析与校验的 Markdown 和 JSON 文件，其他文件会被忽略
3. 点击任意文件即可切换简历；悬停时可重命名或删除源文件，删除前会要求二次确认
4. 下次打开工具会自动记住目录（需点一次「重新授权」）

> 此功能使用 [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)，仅支持 Chrome。

---

## 导出 PDF 推荐设置（Chrome）

| 设置项 | 值 |
|--------|-----|
| 打印机 | 另存为 PDF |
| 纸张 | A4 |
| 缩放 | 100% |
| 页眉和页脚 | 关闭 |
| 背景图形 | 开启 |

---

## 本地开发

```bash
# 构建（Node.js 18+，无需任何 npm 依赖）
node scripts/build.mjs

# 输出
dist/resume-formatter.html
```

目录结构：

```
src/
  index.template.html
  styles/   app.css · resume.css · print.css
  js/       app.js · state.js · parser.js · validator.js
            renderer.js · editor.js · exporter.js
            overflow.js · photo.js · persistence.js · utils.js
fixtures/
  valid/    sample-resume.md · resume-ai-pm v0.md · resume-ai-pm v1.md
  invalid/  missing-required-field.md
scripts/
  build.mjs
dist/
  resume-formatter.html
```

---

## 隐私声明

本工具不收集、不上传、不存储任何用户数据。所有简历内容、照片和导出文件仅在用户浏览器本地处理。

---

## License

MIT
# resume-formatter
