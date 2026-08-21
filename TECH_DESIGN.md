# Technical Design | Resume Formatter v2

## 1. Architecture

源码使用原生 ES Modules。esbuild 将应用代码、PDF.js worker、Mammoth 和 Lucide 打包进一个 IIFE，再内联到 HTML 模板。最终生成三份内容一致的离线文件：

```text
src/v2/*.js + src/styles/v2.css + src/index.template.html
                         |
                         v
                    esbuild
                         |
        index.html = resume-formatter.html
                   = dist/resume-formatter.html
```

构建阶段允许 npm 依赖；运行阶段不加载远程字体、脚本、样式或媒体。

## 2. Modules

| 模块 | 责任 |
| --- | --- |
| `contracts.js` | ResumeDocumentV2、模板合同、迁移、验证、版式解析 |
| `markdown.js` | Markdown v2 解析与序列化 |
| `import-core.js` | 当前 JSON、JSON Resume、提取文本映射 |
| `file-import.js` | 本地 PDF.js / Mammoth 文件读取与限制 |
| `store.js` | 文档状态、本地草稿、版本、undo / redo |
| `renderer.js` | 纸张 DOM、移动编辑器、机器读取规则、溢出定位、diff |
| `ai.js` | 凭据策略、七类提供商协议、模型读取、结构化响应、选区和事实保护 |
| `app.js` | UI 编排、事件、导入确认、导出和用户命令 |

v1 全局脚本不再保留在工作树中；历史实现可从 Git 记录追溯。匿名 Schema v1 fixture 继续用于迁移回归。

## 3. Public Contracts

### ResumeDocumentV2

```text
ResumeDocumentV2 {
  schemaVersion: 2
  appVersion
  documentId
  resumeName
  locale
  profile
  summary
  sections[]
  assets.photo
  layout
  versions[]
  migration
  metadata
}
```

标准栏目：summary、experience、education、projects、skills、certifications、awards、languages、publications、custom。

迁移函数接受 v1 / v2，输出规范 v2。对已迁移文档重复执行不会刷新迁移元数据或改变 documentId。

### TemplateDefinition / LayoutProfile

模板定义名称、方向、关键词、缩略预览、单 / 双栏结构、纸张能力、照片能力、机器读取标签和默认令牌。渲染器根据结构合同决定 DOM 阅读列，不通过模板 ID 推断。用户覆盖值只允许字号、行高、栏目间距、页边距和十六进制强调色，并在解析时夹紧到安全范围。

### AIProviderConfig

```text
AIProviderConfig {
  provider
  baseUrl
  model
  apiKey
  remember
  testStatus
  testedFingerprint
  testedAt
}
```

它存放于独立会话 / 设备存储，不属于 ResumeDocumentV2。任何关键字段变化都会使连接测试指纹失效。

### AIRewriteRequest / AIRewriteResult

请求包含 `fieldPath`、`start`、`end`、`originalText`、`originalHash`、栏目、模式和可选 JD 上下文。结果包含建议、原因、事实变化、供应商和模型元数据。

应用前必须重新计算选区哈希。AI 应用由 `store.transact()` 形成一个原子撤销记录。

### ImportResult

```text
ImportResult {
  document
  confidence: high | medium | low
  unmapped[]
  warnings[]
  source
}
```

只有用户确认后 `document` 才替换当前状态。

## 4. Import Boundaries

- 最大文件 25 MB；PDF 最多 30 页；
- PDF.js 提取可选择文字，低文本密度按扫描件拒绝；
- Mammoth 使用 `extractRawText`，不执行 DOCX 内 HTML；
- 映射器只做保守的栏目、联系方式、日期和 Bullet 启发式；
- 无法确定归属的内容进入 `unmapped`；
- 浏览器不执行导入文件中的脚本或任意 HTML。

## 5. AI Protocols

- OpenAI：Responses API，`text.format.type=json_schema`，`strict=true`；
- Gemini：`generateContent` 和 `responseJsonSchema`；
- DeepSeek / Ollama：OpenAI-compatible Chat Completions，JSON object；
- OpenRouter / Custom：Chat Completions，JSON Schema；
- 彼源 AI：`GET /models` 读取当前令牌可用模型；Chat Completions 只发送 `model + messages`，在 system message 内声明结果 Schema，不强制附加可能与上游模型不兼容的 `response_format`、`temperature` 或 `stream`；
- 所有请求支持超时与 AbortSignal；错误响应截断后展示；
- 所有运行时网络 API 只允许位于 `src/v2/ai.js`。

浏览器 BYOK 不是秘密代理。用户密钥可被当前页面环境读取，因此 UI 必须显示风险；项目不在构建物中包含任何密钥。

## 6. Rendering and Print

纸张使用真实 mm 尺寸，屏幕只通过 `transform: scale()` 缩放。内容高度保持固定，`scrollHeight - clientHeight` 给出溢出量；第一个超出边界的条目获得可视标记。

自动适配按顺序收紧栏目间距、行高和字号，均受最小可读范围限制，不删除文字。

打印媒体隐藏应用壳、编辑按钮、溢出标记和空照片占位。`verify-pdf.mjs` 使用 Chromium 生成 PDF，再由 PDF.js 校验页数、A4 点尺寸和文本层。

## 7. Security and Privacy

- 导入文本通过 `textContent` / 表单 value 渲染，不注入 HTML；
- HTML 导出克隆文档、清空 modal / toast / 选区工具和敏感表单值；
- AI 凭据不进入简历合同；
- 发布脚本扫描用户路径、手机号、非示例邮箱和密钥形态；
- 构建物禁止外部 `src` / `href`；
- 直接依赖许可证必须位于允许列表；
- npm audit 必须为 0 个 moderate 以上漏洞。

## 8. Tests

Node 测试覆盖迁移、Markdown、两种 JSON、提取文本映射、十二套模板合同与令牌、选区哈希、事实保护、七类提供商、彼源模型读取和网络错误。

Playwright 覆盖：

- 无 AI 操作网络数为 0；
- Markdown / PDF / DOCX 导入；
- 编辑、模板、保存、undo / redo；
- 连接测试、选区改写、差异应用和撤销；
- 扫描 PDF 与损坏 DOCX；
- 四种目标视口和移动底部检查器；
- 导出不含 API Key。

CI 顺序：`npm ci` -> audit -> unit -> build -> release check -> Playwright -> PDF verify。
