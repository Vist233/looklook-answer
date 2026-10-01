# 本地性能结果 · 2026-10-01

本轮未请求 DeepSeek 或 MiMo，没有使用真实 API Key，也没有读取用户的题目页面。

| 项目 | 实测 |
|---|---:|
| 单次自动防抖 | 1505 ms |
| 每 300 ms 再变化，共持续 1800 ms，之后防抖 | 3313 ms |
| 100 万字符 Base64 请求组装，中位数 | 2.10 ms |
| 500 万字符 Base64 请求组装，中位数 | 16.54 ms |
| 500 个模拟 SSE 片段解析，中位数 | 1.44 ms |
| 本地历史序列化＋模拟存储，中位数 | 0.21 ms |
| 1138×1205 图片解码、遮挡、PNG 编码，中位数 | 29.3 ms |
| 1920×1080 同上，中位数 | 36.3 ms |
| 2560×1440 同上，中位数 | 45.5 ms |

图片基准在独立的 Codex 内置浏览器本地测试页面运行，执行当前 offscreen.js，使用自行绘制的测试文字图，连续 12 次排除前 2 次热身。页面 CSP 仅允许同源或 data URL，不能连接模型 API。没有访问或操作用户 Chrome 中的作业页面。

请求基准在 WSL Node 运行。fetch 为内存模拟，Chrome storage 同样为内存模拟。因此该结果不能代表实际模型时延，也不包含 Chrome screenshot API / IPC / 实际磁盘存储开销。

已发现的本地主要等待为 1.5 秒防抖；连续变化会不断重置它。已过滤重复设置相同属性值/文本的事件。图片处理为几十毫秒，请求组装/解析为毫秒级，不足以解释数秒以上的额外等待。真实扩展截图与 IPC 尚未测得；新增的本地准备耗时会在下一次实际使用时显示并保存到历史，便于继续定位。

MiMo 官方格式：https://mimo.mi.com/docs/en-US/api/chat/openai-api
图片输入：https://mimo.mi.com/docs/en-US/quick-start/usage-guide/multimodal-understanding/image-understanding
只发送公开的思考开关，不再发送 MiMo 文档未列出的 reasoning_effort。
