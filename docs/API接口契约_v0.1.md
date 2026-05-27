# 《下笔有元》API 接口契约 v0.1

> 目标：定义小程序、总后台、CloudBase 云函数、支付回调、生成任务之间的接口边界。  
> 当前原则：测试号阶段可 mock，但接口形状按正式链路设计，避免后续重构。

## 1. 总体约定

### 1.1 调用方式

一期建议使用 CloudBase 云函数承接 API：

- `miniappApi`：小程序端业务接口；
- `adminApi`：总后台接口；
- `paymentNotify`：微信支付回调；
- `generationWorker`：生成任务处理；
- `scheduledJobs`：超时任务、补偿查询、清理任务。

前端不要直接写数据库。小程序和后台都通过云函数读写。

### 1.2 通用请求结构

```json
{
  "action": "config.getMiniappConfig",
  "tenant_id": "main",
  "payload": {}
}
```

### 1.3 通用响应结构

```json
{
  "success": true,
  "data": {},
  "error": null,
  "request_id": "req_xxx"
}
```

失败：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "CONFIG_NOT_FOUND",
    "message": "配置不存在"
  },
  "request_id": "req_xxx"
}
```

### 1.4 通用错误码

- `UNAUTHORIZED`：未登录或登录态失效；
- `FORBIDDEN`：无权限；
- `VALIDATION_FAILED`：参数不合法；
- `CONFIG_NOT_FOUND`：配置不存在；
- `RESOURCE_NOT_FOUND`：资源不存在；
- `RESOURCE_LOCKED`：资源处理中，不能重复操作；
- `PAYMENT_FAILED`：支付失败；
- `ENTITLEMENT_DENIED`：无查看权益；
- `TASK_NOT_FOUND`：任务不存在；
- `TASK_FAILED`：任务失败；
- `PROVIDER_ERROR`：供应商调用失败；
- `SYSTEM_CLOSED`：系统开关已关闭；
- `INTERNAL_ERROR`：未知错误。

### 1.5 身份约定

小程序端：

- 通过微信登录换取 `openid`；
- 服务端根据 `openid` 找到或创建 `users`；
- 所有小程序端接口服务端自行识别用户，不信任前端传入的 `user_id`。

后台端：

- 管理员账号密码登录；
- 登录后发放后台 token；
- 每个后台请求校验 token、角色和权限；
- 敏感操作写入 `audit_logs`。

## 2. 小程序端接口

### 2.1 获取小程序配置

`miniappApi.config.getMiniappConfig`

用途：加载首页文案、导航、手机号文案、系统开关简化结果。

请求：

```json
{
  "tenant_id": "main",
  "payload": {
    "scene": "home"
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "home_page": {
      "brand_name": "下笔有元",
      "top_slogan": "你只管说，智多星帮你写。",
      "hero_title": "说出目标，我们帮你写成销售信。",
      "hero_subtitle": "告诉我们你想达成的产品或客户目标，智多星会通过提问帮你理清思路，并为你写成有说服力的销售信。",
      "primary_button_text": "开始语音通话 · 首次免费",
      "free_hint": "首次体验可免费生成一封",
      "unclaimed_notice": "你有一封已经写好的销售信，还没有领取。",
      "pain_points": [],
      "steps": [],
      "hero_image_url": ""
    },
    "switches": {
      "guest_home_preview": true,
      "new_conversation": true,
      "new_generation": true,
      "text_mode": true,
      "payment_entry": true
    }
  },
  "error": null
}
```

规则：

- 前端首页正式展示优先使用此接口结果；
- 接口失败时使用前端兜底文案，并上报 `error_logs`；
- 不返回后台敏感字段。

### 2.2 登录/创建用户

`miniappApi.auth.login`

请求：

```json
{
  "payload": {
    "code": "wx_login_code",
    "nickname": "阿明",
    "avatar_url": "https://..."
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "session_token": "miniapp_session_xxx",
    "user": {
      "nickname": "阿明",
      "avatar_url": "https://...",
      "phone_bound": false,
      "first_free_status": "unused",
      "annual_card_status": "none"
    }
  }
}
```

规则：

- 登录页只获取头像昵称；
- 不在登录页获取手机号；
- 游客可浏览首页，但不能进入通话。

### 2.3 获取用户状态

`miniappApi.user.getProfileSummary`

响应：

```json
{
  "success": true,
  "data": {
    "phone_bound": true,
    "first_free_status": "used",
    "annual_card": {
      "status": "none",
      "expires_at": null
    },
    "unclaimed_letter_count": 1
  }
}
```

### 2.4 绑定手机号

`miniappApi.user.bindPhone`

请求：

```json
{
  "payload": {
    "phone_code": "wx_phone_code",
    "related_letter_id": "letter_xxx"
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "phone_bound": true,
    "phone_masked": "138****1234",
    "related_letter_status": "claimable"
  }
}
```

规则：

- 只在生成/领取节点触发；
- 失败时不终止生成；
- 失败状态只是生成页内部状态。

mock 模式：

```json
{
  "payload": {
    "mock_phone": "13800001234",
    "related_letter_id": "letter_xxx"
  }
}
```

## 3. 通话与信息采集接口

### 3.1 获取通话引导配置

`miniappApi.guide.getGuideConfig`

请求：

```json
{
  "payload": {
    "scene": "sales_letter_first_flow"
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "guide_config_id": "main_sales_letter_first_flow_v1",
    "version": 1,
    "stages": [
      {
        "stage_key": "recipient_scope",
        "question": "这封信是给你自己的产品写，还是帮朋友/客户写？",
        "display_mode": "call_card",
        "required": true,
        "options": [
          { "label": "给我自己的产品写", "value": "self_product" }
        ]
      }
    ]
  }
}
```

规则：

- 通话引导不写死；
- 小程序只接收发布态配置；
- 不返回后台编辑字段。

### 3.2 创建会话

`miniappApi.conversation.create`

请求：

```json
{
  "payload": {
    "mode": "voice_push_to_talk",
    "entry": "home"
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "session_id": "sess_xxx",
    "current_stage": "recipient_scope",
    "guide_config_id": "main_sales_letter_first_flow_v1"
  }
}
```

规则：

- 检查 `system_switches.new_conversation`；
- 未登录用户不能创建会话；
- 创建 `conversation_sessions`。

### 3.3 提交通话阶段选择

`miniappApi.conversation.submitStageAnswer`

请求：

```json
{
  "payload": {
    "session_id": "sess_xxx",
    "stage_key": "recipient_scope",
    "answer_type": "option",
    "answer_value": "client_or_friend",
    "answer_text": "帮朋友/客户写"
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "session_id": "sess_xxx",
    "current_stage": "letter_goal",
    "stage_results": {
      "recipient_scope": "client_or_friend"
    },
    "next_question": {
      "stage_key": "letter_goal",
      "question": "这封信发出去后，你最希望实现什么效果？"
    }
  }
}
```

规则：

- 点击选项不跳页，只推进通话页阶段；
- 若回答不明确，返回 `need_clarification: true`。

### 3.4 上传语音片段

`miniappApi.conversation.uploadVoiceSegment`

请求：

```json
{
  "payload": {
    "session_id": "sess_xxx",
    "stage_key": "letter_goal",
    "file_id": "cloud://voice_xxx",
    "duration_ms": 5200
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "segment_id": "seg_xxx",
    "transcript": "我希望客户直接下单",
    "stage_result": {
      "stage_key": "letter_goal",
      "value": "direct_purchase",
      "confidence": 0.86
    },
    "assistant_reply": "好，我知道了，这封信会以促成购买为目标。"
  }
}
```

规则：

- 测试号阶段可 mock 转写；
- 真实模式下语音转写和回复可拆成异步，但单轮尽量控制在 3-5 秒体验目标内；
- 每个片段写入 `transcript_segments`。

### 3.5 切换打字模式

`miniappApi.conversation.switchToText`

请求：

```json
{
  "payload": {
    "session_id": "sess_xxx"
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "mode": "text"
  }
}
```

### 3.6 提交文字回答

`miniappApi.conversation.submitText`

请求：

```json
{
  "payload": {
    "session_id": "sess_xxx",
    "stage_key": "customer_pain",
    "text": "客户主要担心价格贵，也不知道买回去怎么用。"
  }
}
```

响应同语音片段，区别是 `input_type = text`。

### 3.7 获取信息确认摘要

`miniappApi.conversation.getConfirmation`

请求：

```json
{
  "payload": {
    "session_id": "sess_xxx"
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "can_generate": true,
    "fields": [
      { "key": "sender", "label": "发信主体", "value": "阿杰", "required": true },
      { "key": "recipient_scope", "label": "产品归属", "value": "朋友/客户产品", "required": true },
      { "key": "letter_goal", "label": "写信目标", "value": "先建立信任", "required": true }
    ],
    "suggestions": [
      { "key": "proof_case", "text": "补充一个真实案例，会让销售信更可信。" }
    ]
  }
}
```

### 3.8 修改确认字段

`miniappApi.conversation.updateConfirmationField`

请求：

```json
{
  "payload": {
    "session_id": "sess_xxx",
    "field_key": "recipient_scope",
    "value": "client_or_friend"
  }
}
```

## 4. 生成与销售信接口

### 4.1 创建生成任务

`miniappApi.generation.createTask`

请求：

```json
{
  "payload": {
    "session_id": "sess_xxx"
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "task_id": "task_xxx",
    "letter_id": "letter_xxx",
    "status": "queued",
    "progress": 0,
    "message": "智多星正在排队整理这封信"
  }
}
```

服务端动作：

1. 校验会话归属；
2. 校验必填字段；
3. 匹配 `sales_templates`；
4. 创建 `sales_letters`；
5. 创建 `generation_tasks`；
6. 返回任务 ID；
7. 由 `generationWorker` 处理任务。

重要：

- 不在一个云函数调用里同步完成长生成；
- 任务执行进度写入 `generation_tasks`；
- 失败不能清空会话和转写。

### 4.2 查询生成任务状态

`miniappApi.generation.getStatus`

请求：

```json
{
  "payload": {
    "task_id": "task_xxx"
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "task_id": "task_xxx",
    "letter_id": "letter_xxx",
    "status": "running",
    "progress": 60,
    "step": "正在组织成交逻辑",
    "claim_required": true,
    "phone_bound": false
  }
}
```

状态：

- `queued`
- `running`
- `succeeded`
- `failed`
- `retrying`

### 4.3 重试生成任务

`miniappApi.generation.retry`

请求：

```json
{
  "payload": {
    "task_id": "task_xxx"
  }
}
```

规则：

- 检查 `max_retry_count`；
- 新增重试记录或更新原任务状态；
- 不要求用户重新说一遍。

### 4.4 获取销售信详情

`miniappApi.salesLetter.getDetail`

请求：

```json
{
  "payload": {
    "letter_id": "letter_xxx"
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "letter_id": "letter_xxx",
    "title": "给老客户的复购销售信",
    "status": "preview",
    "can_view_full": false,
    "preview_content": "预览内容...",
    "content": null,
    "paywall": {
      "required": true,
      "single_unlock_price": 20000,
      "annual_card_price": 200000
    }
  }
}
```

规则：

- `can_view_full` 由服务端根据 `entitlement_ledgers` 计算；
- 前端不能通过传参要求看全文；
- 首次免费也要走权益判断。

### 4.5 我的销售信列表

`miniappApi.salesLetter.listMine`

请求：

```json
{
  "payload": {
    "status": "all",
    "page": 1,
    "page_size": 20
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "letter_id": "letter_xxx",
        "title": "给老客户的复购销售信",
        "status": "generated_pending_claim",
        "action_label": "领取完整内容",
        "created_at": 1710000000000
      }
    ],
    "has_more": false
  }
}
```

## 5. 档案接口

### 5.1 我的档案列表

`miniappApi.memory.listProfiles`

请求：

```json
{
  "payload": {
    "profile_type": "product"
  }
}
```

### 5.2 档案详情

`miniappApi.memory.getProfile`

请求：

```json
{
  "payload": {
    "profile_id": "mem_xxx"
  }
}
```

### 5.3 修改档案归属

`miniappApi.memory.updateProfile`

请求：

```json
{
  "payload": {
    "profile_id": "mem_xxx",
    "ownership": "client_or_friend",
    "fields": {
      "owner_name": "阿杰"
    }
  }
}
```

规则：

- 用户只能改自己的档案；
- 帮朋友/客户写的内容默认不进入自己的长期产品档案；
- 修改记录写入 `audit_logs` 或用户操作日志。

## 6. 支付与权益接口

### 6.1 获取价格配置

`miniappApi.payment.getPricing`

响应：

```json
{
  "success": true,
  "data": {
    "single_unlock_price": 20000,
    "annual_card_price": 200000,
    "currency": "CNY",
    "annual_card_label": "更划算",
    "single_to_annual_deduct_days": 7,
    "payment_mode": "mock"
  }
}
```

### 6.2 创建订单

`miniappApi.payment.createOrder`

请求：

```json
{
  "payload": {
    "product_type": "single_unlock",
    "related_letter_id": "letter_xxx"
  }
}
```

响应：

mock 模式：

```json
{
  "success": true,
  "data": {
    "order_id": "ord_xxx",
    "order_no": "XBYY202605220001",
    "payment_mode": "mock",
    "mock_pay_token": "mock_xxx"
  }
}
```

微信支付模式：

```json
{
  "success": true,
  "data": {
    "order_id": "ord_xxx",
    "order_no": "XBYY202605220001",
    "payment_mode": "wechat",
    "wx_pay_params": {}
  }
}
```

规则：

- 服务端读取 `pricing_configs`，前端不传金额；
- 单封解锁必须绑定 `related_letter_id`；
- 年卡不绑定具体信件也可以；
- 支付入口关闭时返回 `SYSTEM_CLOSED`。

### 6.3 mock 支付完成

`miniappApi.payment.mockPaySuccess`

请求：

```json
{
  "payload": {
    "order_id": "ord_xxx",
    "mock_pay_token": "mock_xxx"
  }
}
```

服务端动作：

1. 校验 mock 模式；
2. 更新订单为 `paid`；
3. 写入 `payment_notify_logs`；
4. 发放 `entitlement_ledgers`；
5. 返回权益结果。

### 6.4 查询订单状态

`miniappApi.payment.getOrderStatus`

请求：

```json
{
  "payload": {
    "order_id": "ord_xxx"
  }
}
```

### 6.5 获取权益摘要

`miniappApi.entitlement.getSummary`

响应：

```json
{
  "success": true,
  "data": {
    "first_free": {
      "status": "used"
    },
    "annual_card": {
      "status": "none",
      "expires_at": null
    },
    "unlocked_letter_ids": ["letter_xxx"]
  }
}
```

## 7. 微信支付回调

### 7.1 支付回调入口

`paymentNotify.wechatPay`

来源：微信支付服务器。

处理流程：

1. 验签；
2. 写入 `payment_notify_logs` 原文；
3. 根据 `order_no` 查询订单；
4. 如果订单已支付，直接返回成功，不重复发权益；
5. 更新订单支付状态；
6. 生成 `idempotency_key`；
7. 查询是否已有对应 `entitlement_ledgers`；
8. 没有则发放权益；
9. 写入处理结果。

幂等 key 示例：

```text
wechat_{wx_transaction_id}
order_{order_id}_{product_type}
```

### 7.2 支付补偿查询

`adminApi.payment.reconcileOrder`

用途：后台对支付异常订单手动触发查询。

规则：

- 仅管理员可用；
- 查询结果写 `payment_notify_logs`；
- 如确认支付成功，走同一套权益发放逻辑；
- 写 `audit_logs`。

## 8. 生成任务 Worker

### 8.1 处理任务

`generationWorker.processTask`

请求：

```json
{
  "task_id": "task_xxx"
}
```

流程：

1. 读取 `generation_tasks`；
2. 抢占任务，状态改为 `running`；
3. 读取 `conversation_sessions` 和 `transcript_segments`；
4. 读取 `generation_configs`；
5. 匹配 `sales_templates`；
6. 生成销售信；
7. 写入 `sales_letter_versions`；
8. 更新 `sales_letters.latest_version_id`；
9. 更新任务为 `succeeded`；
10. 失败时记录错误，任务可重试。

注意：

- 单次云函数执行按 60 秒上限设计；
- 如果预计超过 60 秒，应拆分任务或交给云托管/队列式处理；
- 前端只轮询 `generation.getStatus`。

## 9. 后台接口

后台接口统一走 `adminApi`，必须校验管理员 token。

### 9.1 管理员登录

`adminApi.auth.login`

请求：

```json
{
  "payload": {
    "username": "admin",
    "password": "******"
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "admin_token": "adm_token_xxx",
    "admin": {
      "username": "admin",
      "role": "super_admin"
    }
  }
}
```

### 9.2 首页配置

获取：

`adminApi.config.getHomeConfig`

保存：

`adminApi.config.saveHomeConfig`

请求：

```json
{
  "payload": {
    "brand_name": "下笔有元",
    "hero_title": "说出目标，我们帮你写成销售信。",
    "primary_button_text": "开始语音通话 · 首次免费",
    "reason": "调整首页文案"
  }
}
```

规则：

- 保存写入 `app_configs`；
- 写入 `audit_logs`；
- 小程序下一次读取配置时生效。

### 9.3 通话引导配置

- `adminApi.guide.listConfigs`
- `adminApi.guide.getConfig`
- `adminApi.guide.saveConfig`
- `adminApi.guide.publishConfig`

保存时必须校验：

- `stage_key` 不重复；
- 必答阶段不能没有问题；
- 选项 value 不重复；
- `write_to` 合法；
- 发布态至少包含 `recipient_scope` 和 `letter_goal`。

### 9.4 销售信模板管理

- `adminApi.template.listTemplates`
- `adminApi.template.getTemplate`
- `adminApi.template.saveTemplate`
- `adminApi.template.publishTemplate`
- `adminApi.template.testPreview`

保存请求：

```json
{
  "payload": {
    "template_id": "tpl_wechat_direct_purchase_v3",
    "template_name": "微信私聊成交信",
    "applicable_goals": ["direct_purchase"],
    "applicable_scopes": ["self_product", "company_product"],
    "structure": [
      {
        "section_key": "opening",
        "section_name": "开头破冰",
        "requirement": "像熟人聊天，不要像广告。"
      }
    ],
    "forbidden_expressions": ["夸大承诺", "虚假案例"],
    "reason": "优化成交信结构"
  }
}
```

规则：

- 修改已发布模板建议生成新版本；
- 保存写 `audit_logs`；
- 已生成信件保留旧模板版本。

### 9.5 系统开关

- `adminApi.switches.get`
- `adminApi.switches.save`

规则：

- 高风险开关需要二次确认；
- 保存写 `audit_logs`；
- 小程序端接口读取后立即生效。

### 9.6 用户管理

- `adminApi.user.list`
- `adminApi.user.getDetail`
- `adminApi.user.getLetters`
- `adminApi.user.getOrders`
- `adminApi.user.getEntitlements`
- `adminApi.user.addRemark`

### 9.7 销售信管理

- `adminApi.salesLetter.list`
- `adminApi.salesLetter.getDetail`
- `adminApi.salesLetter.getVersions`
- `adminApi.salesLetter.retryGeneration`
- `adminApi.salesLetter.markAbnormal`

### 9.8 订单与支付

- `adminApi.payment.listOrders`
- `adminApi.payment.getOrderDetail`
- `adminApi.payment.getNotifyLogs`
- `adminApi.payment.reconcileOrder`
- `adminApi.payment.markAbnormal`

### 9.9 权益流水

- `adminApi.entitlement.list`
- `adminApi.entitlement.getDetail`
- `adminApi.entitlement.createCompensation`

补偿规则：

- 必须填写原因；
- 必须指定权益类型；
- 必须写入 `audit_logs`；
- 不能直接改用户权限摘要。

### 9.10 日志与审计

- `adminApi.audit.list`
- `adminApi.audit.getDetail`
- `adminApi.logs.listErrors`
- `adminApi.logs.listProviderCalls`

## 10. mock 闭环接口策略

测试号阶段先跑通：

1. mock 首页配置读取；
2. mock 通话引导配置读取；
3. mock 语音转写；
4. mock 销售信模板匹配；
5. mock 销售信生成；
6. mock 手机号授权；
7. mock 支付；
8. mock 权益发放；
9. mock 订单和权益后台查看。

mock 阶段仍写真实集合：

- `conversation_sessions`
- `transcript_segments`
- `generation_tasks`
- `sales_letters`
- `sales_letter_versions`
- `orders`
- `payment_notify_logs`
- `entitlement_ledgers`

这样正式接入时只替换供应商和支付模式，不重写业务流程。

## 11. 端到端流程

### 11.1 首次免费生成

1. 小程序调用 `config.getMiniappConfig`。
2. 用户登录 `auth.login`。
3. 创建会话 `conversation.create`。
4. 获取引导 `guide.getGuideConfig`。
5. 通话页提交阶段答案和语音片段。
6. 信息确认 `conversation.getConfirmation`。
7. 创建生成任务 `generation.createTask`。
8. 轮询 `generation.getStatus`。
9. 生成成功后进入领取。
10. 用户授权手机号 `user.bindPhone`。
11. 服务端发放或确认首次免费权益。
12. 获取销售信详情 `salesLetter.getDetail`，可查看全文。

### 11.2 二次付费解锁

1. 用户生成第二封信。
2. 服务端判断无免费权益，只返回预览。
3. 小程序展示解锁页。
4. 获取价格 `payment.getPricing`。
5. 创建订单 `payment.createOrder`。
6. mock 或微信支付成功。
7. 回调/支付完成发放权益。
8. 再次请求 `salesLetter.getDetail`，可查看全文。

### 11.3 生成失败重试

1. `generation_tasks.status = failed`。
2. 小程序展示生成失败/重试状态。
3. 用户点击重试 `generation.retry`。
4. 服务端使用原会话、原转写、原确认信息重新生成。
5. 成功后更新信件版本。

## 12. 开发注意事项

1. 小程序端不直接读写数据库。
2. 首页文案不写死。
3. 通话引导不写死。
4. 销售信模板不写死。
5. 金额不信任前端传参。
6. 权益不信任前端传参。
7. 支付回调要幂等。
8. 长生成任务不做同步等待。
9. 配置保存、模板发布、价格修改、权益补偿必须写审计日志。
10. CloudBase 集合创建、索引和权限需要先手动配置。
