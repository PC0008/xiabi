# Edgespark 运行配置就绪度

生成时间：2026-05-28T10:11:12.022Z

说明：本报告来自 `edgespark var list` 和 `edgespark secret list`，只记录变量/密钥是否存在，不输出任何密钥值。

## 总览

- 普通变量：20 个
- Secret：9 个
- 能力组：6/8 已具备基础配置
- 最终验收批次：5/7 平台配置已具备

## 能力组

| 能力 | 状态 | 缺少必需项 | 可选缺口 | 可验收内容 |
| --- | --- | --- | --- | --- |
| 管理员登录 | 已配置 | 无 | 无 | 管理后台登录、管理员账号安全 |
| DeepSeek 写信 | 已配置 | 无 | 无 | DeepSeek 写信闭环、异步写信任务 |
| 微信支付 | 可运行但有可选缺口 | 无 | `WECHAT_PAY_PLATFORM_PUBLIC_KEY`、`WECHAT_PAY_PLATFORM_CERT_SERIAL_NO`、`WECHAT_MP_APP_SECRET` | 微信 H5 支付下单、微信支付回调验签、订单权益到账 |
| 微信内 H5 语音输入 | 未就绪 | `WECHAT_MP_APP_SECRET` | `微信公众平台 JS 接口安全域名` | 微信 JS-SDK 签名、手机微信按住说话 |
| 阿里云短信 | 可运行但有可选缺口 | 无 | `SMS_CODE_PEPPER` | 短信发送、手机号绑定 |
| MiniMax 说话播放 | 已配置 | 无 | 无 | 智多星说话播放 |
| 服务端 ASR 语音输入 | 未就绪 | `VOICE_ASR_ENDPOINT`、`VOICE_ASR_VERIFIED` | `VOICE_ASR_PROVIDER`、`VOICE_ASR_MODEL`、`VOICE_ASR_REQUEST_FORMAT`、`VOICE_INPUT_MODE`、`VOICE_ASR_API_KEY` | 浏览器不支持语音识别时的录音转写 |
| 部署运行地址 | 已配置 | 无 | 无 | 线上回跳、异步任务队列 |

## 最终验收批次

| 批次 | 平台配置状态 | 配置阻塞 | 还需本机验收输入 |
| --- | --- | --- | --- |
| 后台账号、后台控制前台与供应商前置自检 | 平台配置已具备 | 无 | `XIABI_VERIFY_ADMIN_USERNAME`、`XIABI_VERIFY_ADMIN_PASSWORD` |
| DeepSeek 写信、权益、导出与 MiniMax 说话 | 平台配置已具备 | 无 | `XIABI_VERIFY_DEEPSEEK`、`XIABI_VERIFY_REPEAT_FREE`、`XIABI_VERIFY_TTS` |
| 真实短信发送、验证码绑定与资产归属 | 平台配置已具备 | 无 | `XIABI_VERIFY_SMS_PHONE`、`XIABI_VERIFY_SMS_CODE` |
| 微信支付下单与支付审计 | 平台配置已具备 | 无 | `XIABI_VERIFY_PAYMENT_CREATE` |
| 微信真实付款、回调与权益到账 | 平台配置已具备 | 无 | `XIABI_VERIFY_PAID_ORDER_ID` |
| 服务端 ASR 音频样本 | 平台配置未就绪 | 服务端 ASR 语音输入 | `XIABI_VERIFY_ASR_AUDIO`、`XIABI_VERIFY_ASR_EXPECTED_TEXT` |
| 微信内 H5 语音 JS-SDK 与手机实测 | 平台配置未就绪 | 微信内 H5 语音输入 | `XIABI_VERIFY_WECHAT_VOICE`、`XIABI_VERIFY_WECHAT_VOICE_MANUAL` |

## 当前关键缺口

- 微信内 H5 语音输入缺 `WECHAT_MP_APP_SECRET`，并且还需要在微信公众平台配置 JS 接口安全域名后做手机实测。
- 服务端 ASR 语音输入缺 `VOICE_ASR_ENDPOINT` 和 `VOICE_ASR_VERIFIED`；MiniMax 官方公开文档未列独立 ASR/STT 端点时，不应臆造 endpoint。
- 微信支付平台变量和商户密钥已存在，但真实付款仍依赖微信商户产品权限和小额实付验收。
- 本报告只证明平台配置存在性；最终仍以 `npm run verify:production:report` 的真实外部链路验收为准。
