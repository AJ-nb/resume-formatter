---
role: layout-tool-boundary
---

# 简历排版器开发边界

本仓库是公开的本地优先简历编辑与排版工具。仓库负责版本化内容解析、Schema 校验、纸张排版、版面诊断、浏览器内编辑、受控 AI 建议以及 HTML / PDF 导出。

## 职责边界

用户负责：

- 简历事实、经历选材与最终文字表达；
- 岗位匹配、内容审核与版本冻结；
- 是否采用浏览器内编辑结果。

本工具负责：

- 解析和校验版本化输入；
- 渲染 A4 页面并计算溢出高度；
- 返回换行、溢出与排版参数诊断；
- 导出可独立打开的 HTML，并通过浏览器打印生成 PDF。
- 在用户主动触发时发送最小必要上下文，并将 AI 输出作为待审建议；
- 在应用 AI 建议前校验选区版本和数字、日期、比例、缩写变化。

浏览器内的正文编辑属于当前排版草稿。工具默认不回写来源 Markdown；需要与其他系统集成时，由适配层接收候选修改或版面诊断。

## 隐私与发布规则

本仓库及 GitHub Pages 均按公开资产处理。

1. 源码、文档、测试、截图、fixture、提交记录和构建产物只能使用明确虚构的数据。
2. 真实简历、照片、联系方式、岗位材料、认证截图和导出文件不得进入仓库。
3. 用户文件只在浏览器本地读取；除 `src/v2/ai.js` 中由用户主动触发的 BYOK 请求外，不得新增远程上传、埋点或第三方运行时资源。
4. 浏览器草稿可以保存在当前设备的 `localStorage` / `IndexedDB`；文档必须准确说明本地存储行为。
5. 发布前必须从匿名 fixture 重新构建，并执行测试、构建一致性检查与敏感信息扫描。
6. 不得自动覆盖来源 Markdown。删除或重命名用户本地文件必须经过明确确认。
7. 凭据不得进入 ResumeDocument、fixture、截图、提交记录或任何导出；默认只存入 `sessionStorage`。

## 集成合同

推荐的上游输入：

```text
ResumeDocument { schema_version, content, assets[] }
LayoutProfile { profile_version, theme, typography, spacing }
```

推荐的下游输出：

```text
RenderArtifact { formatter_version, source_hash, html_ref, pdf_ref }
LayoutDiagnostics { page_count, overflow_mm, wrapped_items, attempted_settings }
```

上游拥有简历事实和来源文档；本工具拥有布局配置、渲染结果和版面诊断。

## 发布验收

- 匿名样例能够导入并通过 Schema 校验；
- 桌面 Chrome 中 A4 页面无越界、重叠和异常换行；
- 超长内容能返回明确溢出诊断；
- HTML 保存与 PDF 打印入口可用；
- 页面运行不发送用户简历数据；
- `node scripts/check-release.mjs` 通过。
