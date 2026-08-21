# Resume Formatter v2.3

一个本地优先的简历编辑与排版工具。内容使用版本化 Markdown / JSON 管理，浏览器负责结构化编辑、模板排版和 PDF 打印。构建产物仍是一个可以离线打开的 HTML，不加载远程字体、脚本、图片或统计代码。

本项目 Fork 自 [gracexygu/resume-formatter](https://github.com/gracexygu/resume-formatter)，上游与本 Fork 均使用 MIT License。v2 开发仓库位于 [AJ-nb/resume-formatter](https://github.com/AJ-nb/resume-formatter)。GitHub Pages 仅在人工审阅并合并后启用。

## 功能

- 导入当前 JSON、Markdown、JSON Resume、PDF 和 DOCX
- PDF / DOCX 只在浏览器本地解析，限制 25 MB、PDF 30 页
- 扫描型 PDF 明确提示不支持 OCR，不静默猜测或丢弃内容
- 导入前展示检测栏目、置信度、警告和未映射片段
- 十二套独立模板：中文紧凑、现代无衬线、经典衬线、行政简约、学术研究、两栏视觉、国际标准、技术精密、咨询简报、金融专业、创意工作室、初创敏捷
- 模板支持关键词搜索和岗位方向筛选，缩略预览反映真实单栏 / 双栏结构
- A4 / US Letter、证件照、本地版本、溢出定位与自动适配
- 简历母版与独立岗位版本；基于创建基线做三方差异，只自动同步岗位版未修改的字段，冲突逐项选择
- 岗位面板记录公司、岗位、语言、完整 JD、来源备注和更新时间
- 结构化事实证据：背景、任务、个人行动、范围、结果、证明来源和核实状态
- JD 先在本机提取要求，再可选使用 AI；明确区分已有证据、表达缺口、证据缺口、真实能力缺口和无法判断
- 根据岗位、语言、内容长度、照片与阅读顺序风险推荐三套模板，完整 12 套保留在模板库
- 桌面三栏工作区；移动端内容 / 预览切换、底部检查器和快速模板选择
- OpenAI、DeepSeek、Gemini、OpenRouter、彼源 AI、Ollama 与自定义 OpenAI-compatible 端点
- 选区专业化、精炼、结果导向；先看差异，再应用或丢弃
- 选区哈希与字符偏移保护，数字、日期、比例和缩写变化需二次确认
- 全文问题清单、JD 对照和 `blocker / warning / info` 可解释检查
- 深度检查覆盖重复动词、空泛职责、过长 Bullet、语言混用、日期格式与重叠、链接、技能证据、未核实数字和重复内容
- 快速扫描展示首屏阅读顺序、身份与联系方式、前三条成果和量化信息，不生成 ATS 分数或招聘者阅读时长
- 岗位版本显示母版更新、差异对比和导出记录；打开投递打印流程后冻结为只读快照，可复制为新版本继续编辑
- “投递 PDF”先执行硬错误门禁；警告经逐项确认可继续
- 独立 HTML、Markdown、简历 JSON，以及包含岗位、JD、证据和版本的工作区 JSON 备份

机器可读性检查是确定性规则，不代表真实 ATS 通过率，也不会产生伪精确分数。两栏视觉版会明确显示阅读顺序风险。

## 快速开始

直接下载并打开 [`dist/resume-formatter.html`](dist/resume-formatter.html)。该文件可离线使用；PDF / DOCX 解析器、图标和字体策略均已包含在文件中。

编辑完成后使用顶部导出菜单：

1. `独立 HTML` 保存可重新打开的完整草稿；
2. `Markdown` 或 `JSON` 保存机器可读内容；
3. `工作区 JSON` 备份岗位、JD、证据与版本，不包含 API Key；
4. `投递 PDF` 通过检查门禁后打开浏览器打印对话框。

建议在 Chromium 系浏览器中打印，保持缩放 100%、关闭浏览器页眉页脚并启用背景图形。

## AI 设置与隐私

AI 功能完全可选。未点击连接测试、改写、全文审阅或 JD 对照时，应用不会发出网络请求。

彼源 AI 用户在设置中选择“彼源 AI”后，Base URL 会自动填入 `https://api.biyuan.ai/v1`。输入自己的令牌，点击“读取可用模型”，再选择当前令牌有权限的模型并执行连接测试。模型读取只请求 `/models`，不发送简历内容；彼源聊天请求使用兼容性更高的最小 Chat Completions 参数，并在消息内声明结果 Schema。

- 选区改写只发送选中文字、字段路径、所在栏目、改写模式，以及用户明确提供的 JD 上下文。
- 证据生成只发送用户选定的证据、目标字段和明确选择的 JD 要求；缺失数字要求保留“待补充”。
- 全文审阅发送当前简历的纯文本表示。
- JD 对照发送当前简历纯文本和用户粘贴的岗位描述。
- 全文审阅与 JD 对照发送前会显示提供商、模型、文本类型和字符数，确认后才联网。
- API Key 默认只保存在 `sessionStorage`；勾选“记住到本机”后才写入 `localStorage`。
- 浏览器直连意味着密钥会存在于当前页面运行环境。不要在不可信页面、共享设备或他人修改过的 HTML 中使用密钥。
- 凭据不属于 `ResumeDocumentV2` 或 `ApplicationWorkspaceV1`，不会进入任何简历或工作区导出。
- 普通 HTML、Markdown、简历 JSON 和 PDF 不包含 JD、证据或岗位历史；工作区 JSON 包含这些本地资料，导出前会提示敏感范围。

完整说明见 [PRIVACY.md](PRIVACY.md)。

## ResumeDocumentV2

Markdown 示例：

```markdown
---
schema_version: 2
resume_name: 示例产品经理
locale: zh-CN
name: 示例用户
headline: 产品经理
location: 海州市
phone: 138-0000-0000
email: person@example.com
website: portfolio.example.com
---

## 个人摘要
关注复杂业务工具与可衡量的产品改进。

## 工作经历

### 星河科技
role: 高级产品经理
date: 2022.06 - 至今
location: 海州市

- 重构核心流程，将关键任务完成时间缩短 32%。

## 专业技能

- 产品策略、用户研究、数据分析
```

支持摘要、工作、教育、项目、技能、认证、奖项、语言、出版物和自定义栏目。Schema v1 文档与已有本地草稿会在读取时幂等迁移，原文件不会被自动覆盖。

## ApplicationWorkspaceV1

首次打开工作区版本时，当前简历迁移为母版，现有本地版本进入母版历史；原存储键不会删除，并额外保存迁移前回滚副本。每个岗位版本保存独立 `ResumeDocumentV2` 快照、创建时母版基线、JD、证据、要求匹配和导出记录。v2.3 使用创建基线、当前母版和当前岗位版本做三方差异；岗位版自行修改的字段不会自动覆盖。照片在工作区中按内容哈希去重，导出活动简历时重新补全资产。

工作区默认仅保存在当前浏览器 `localStorage`。使用“工作区 JSON”可以主动备份或恢复完整工作区；该格式与普通简历 JSON 不同，不应作为投递附件。

## 本地开发

要求 Node.js 20 或更高版本。

```bash
npm ci
npm test
npm run build
npm run test:e2e
npm run check:release
```

启动本地预览：

```bash
npm run dev -- 4173
```

构建会生成内容一致的：

```text
index.html
resume-formatter.html
dist/resume-formatter.html
```

源码采用原生 ES Modules，esbuild 将 PDF.js worker、Mammoth 和 Lucide 一并打入最终 HTML。直接依赖及许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 验证

- Node 单元测试：简历与工作区迁移、三方同步、冻结复制、深度检查、快速扫描、资产去重、JD 匹配、证据、投递门禁、选区哈希、事实保护、七类提供商和错误路径
- Playwright：母版与岗位版本、差异同步、快速扫描、AI 发送前披露、冻结复制、JD、证据生成、工作区备份、投递门禁、导入、编辑、模板、AI 接受 / 撤销、移动端和凭据剥离
- PDF 校验：单页 A4 尺寸、可选择文字和 PNG 视觉检查
- 发布检查：构建一致性、敏感信息、许可证、网络边界和 5 MB 体积预算

所有公开 fixture 均为虚构数据。

## 不在范围内

OCR、DOCX 导出、云同步、账号系统、求职看板、自动投递、模拟面试、任意 HTML 模板运行时导入，以及 AI 自动批量覆盖。

## License

[MIT License](LICENSE)
