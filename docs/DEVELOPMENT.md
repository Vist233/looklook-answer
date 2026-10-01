# 开发与发布准备

## 环境

原生 JavaScript Chrome Manifest V3 扩展，无构建步骤和第三方运行时依赖。最低 Chrome 版本为 116。

开发建议 Node.js 24，项目目录运行：

```bash
node --test tests/*.test.mjs
node --check content.js
node --check core.mjs
node --check request.mjs
node --check worker.mjs
node --check popup.js
```

Windows 开发使用 WSL2 Ubuntu-22.04，保持项目原目录，不混用 Windows/Linux 依赖。安装扩展无需开发环境。

## API 适配

`core.mjs` 根据 URL 路径选择协议。`/anthropic` 或 `/messages` 使用 Anthropic，其余使用 OpenAI Chat Completions。

| 内容 | OpenAI 兼容 | Anthropic 兼容 |
| --- | --- | --- |
| 地址末尾 | `/chat/completions` | `/messages` |
| 认证 | Bearer | `x-api-key`，版本头 `2023-06-01` |
| 图片 | data URL 的 `image_url` | Base64 `image.source` |
| 答案流 | `choices[].delta.content` | `text_delta` |
| Thinking | `reasoning_content` | thinking 块及 `thinking_delta` |
| 结束 | finish reason 或 DONE | `message_stop` |

MiMo OpenAI 使用 `thinking.type: enabled` 和 `max_completion_tokens: 8192`。Anthropic 使用 `max_tokens: 8192`、thinking budget 1024。其他 OpenAI 主机当前发送 `max_tokens` 与 `reasoning_effort: low`；未支持时需适配，不能假设所有接口接受。

提示词统一来自 `SYSTEM_PROMPT` 和 `IMAGE_PROMPT`，修改时同时验证两个协议。

## 验证范围

自动测试使用假的 Chrome API、时钟及 fetch，覆盖请求格式、SSE 分块、Thinking 分离、可信点击、1600ms 防抖、立即分析、导航恢复、旧请求取消和历史字段。

不验证模型是否遵循提示词、真实页面选择器、Chrome 授权 UI 或供应商可用性。1.7.0 没有真实模型测试。

手动验收应包括：安装更新、开启、连点重置、选项点击、换 URL、框内点击排除、关闭、历史及遮挡。模型验收包括仅回答当前题、多题歧义和信息不足。启用会产生 API 请求。

`tests/local-performance-report.md` 和结果文件是早期本地基线，不代表当前防抖或真实模型速度。`tests/anthropic-smoke.py` 为手动真实 API 探测，不属于自动测试，可能收费，禁止在 CI 自动执行。

## Git 上传与共享

尚未指定托管平台、仓库地址或许可证。本次只准备文件，不推送。

1. 只上传本项目，排除浏览器配置、用户历史和外部备份。
2. 检查 `.gitignore`、暂存内容和密钥扫描；忽略规则不移除已被跟踪文件。
3. 提交源码、README、docs、CHANGELOG 和模拟测试，不提交真实密钥、个人截图、历史导出或 `.env`。
4. 确定仓库、公开范围和许可证。当前无许可证文件，不宣称已有开源授权。
5. 初始化或复用仓库，审查后提交，确认远端再推送。
6. 标签建议 `v1.7.0`，发行 ZIP 保留 manifest、运行源码和文档；用户解压后直接加载。

示例流程（替换真实地址，本文不执行）：

```bash
git init
git add .
git diff --cached --stat
git diff --cached
git commit -m "Release Page Vision 1.7.0"
git branch -M main
git remote add origin <repository-url>
git push -u origin main
```

上传前确认内容、目标和许可证。文档使用相对链接，不依赖本机路径。版本变化同步 README、CHANGELOG 和 manifest，并提醒重新加载扩展、刷新网页。
