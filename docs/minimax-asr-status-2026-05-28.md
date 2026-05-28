# MiniMax 语音输入接入状态

更新时间：2026-05-28

## 当前结论

MiniMax 官方 API 总览当前公开列出的 Speech 能力包括：

- Text to Speech (T2A)
- T2A Async
- Voice Cloning
- Voice Design
- Voice Management

官方总览没有列出独立的 Speech-to-Text / ASR / audio transcription 接口。因此本项目不硬编码或猜测 MiniMax ASR URL。

## 项目当前实现

- 智多星说话播放：已按 MiniMax TTS 接入，使用 `VOICE_API_KEY`、`MINIMAX_GROUP_ID`、`MINIMAX_VOICE_ID`、`MINIMAX_TTS_ENDPOINT`、`MINIMAX_TTS_MODEL`。
- 用户语音输入：服务端保留真实 ASR 接入槽 `/api/public/voice/transcribe`。
- ASR 请求格式：支持 JSON base64 和 OpenAI-compatible multipart。
- MiniMax Group ID：如果 `VOICE_ASR_PROVIDER=minimax` 或 endpoint 域名包含 `minimax`，服务端会自动携带 `MINIMAX_GROUP_ID`。
- 验收闸门：只有真实音频样本验收通过后，才应设置 `VOICE_ASR_VERIFIED=1`；否则用户端不会把服务端录音转写当成已可用能力。

## 要让“输入也走 MiniMax”还需要什么

需要从 MiniMax 账号后台或官方支持处拿到实际语音转文字接口信息：

- `VOICE_ASR_ENDPOINT`
- `VOICE_ASR_REQUEST_FORMAT=json` 或 `openai`
- `VOICE_ASR_MODEL`，如果接口要求
- `VOICE_ASR_API_KEY`，如果不复用 `VOICE_API_KEY`
- 一段可验收的本地音频样本
- 音频里的预期关键句，用于 `XIABI_VERIFY_ASR_EXPECTED_TEXT`

拿到后执行：

```powershell
$env:XIABI_VERIFY_ASR_AUDIO="D:\path\to\sample.wav"
$env:XIABI_VERIFY_ASR_EXPECTED_TEXT="音频里说出的关键句"
npm run verify:production
```

验收通过后，再在 Edgespark 设置：

```powershell
edgespark var set VOICE_ASR_VERIFIED=1 VOICE_INPUT_MODE=server VOICE_ASR_PROVIDER=minimax
```

## 2026-05-28 复核记录

本轮重新读取了 MiniMax 官方文档索引 `https://platform.minimax.io/docs/llms.txt`。索引里的 Speech 相关 API 仍是：

- `speech-t2a-http`
- `speech-t2a-websocket`
- `speech-t2a-async-create`
- `speech-t2a-async-query`
- voice cloning upload / clone / prompt
- voice design
- voice management

索引中没有出现 speech-to-text、ASR、transcription、audio transcription 等独立转写接口。因此当前交付口径保持不变：MiniMax TTS 已接；MiniMax ASR 不臆造 URL，继续等待 MiniMax 账号后台或官方支持给出真实转写 endpoint。

## 2026-05-28 最新在线复核

本轮再次在线打开 MiniMax 官方 API Overview 和官方 `llms.txt`：

- API Overview 的 Speech 导航仍只列 `T2A`、`T2A Async`、`Voice Cloning`、`Voice Design`、`Voice Management`。
- `llms.txt` 的 Speech 相关条目仍只包含 `speech-t2a-async-create`、`speech-t2a-async-query`、`speech-t2a-http`、`speech-t2a-websocket`、voice cloning、voice design、voice management。
- 官方索引未列出独立 `ASR`、`STT`、`speech-to-text`、`transcription` 或 `audio transcription` 页面。

因此当前代码和交付口径继续保持：MiniMax TTS 已真实接入；语音输入只保留可配置 ASR 接入位，拿到 MiniMax 账号实际转写 endpoint 并用音频样本跑通后，才允许设置 `VOICE_ASR_VERIFIED=1`。

## 官方来源

- MiniMax API Overview: https://platform.minimax.io/docs/api-reference/api-overview
- MiniMax Documentation Index: https://platform.minimax.io/docs/llms.txt
