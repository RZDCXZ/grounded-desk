# 18 — 完成真实模型与云端发布验证

**What to build:** 项目维护者可以用真实供应商验证完整检索增强生成链路，再将已验证的迁移和应用发布到 Supabase Cloud 与 Vercel，并完成公开体验冒烟检查。

**Blocked by:** 17 — 通过本地 MVP 发布门槛.

**Status:** resolved

- [x] 独立真实 AI 冒烟命令调用硅基流动 Embedding、Rerank 和 DeepSeek，完成至少一个有据回答、一个可靠拒答和一次多轮追问。
- [x] 有据回答引用预期知识来源，可靠拒答不添加来源外事实，真实供应商调用失败时输出可诊断结果。
- [x] 缺少模型密钥时真实冒烟测试明确报告跳过，不会伪装成成功，也不会阻塞普通确定性测试。
- [x] Supabase Cloud 只接收版本化迁移、配置和必要种子，不复制本地知识来源、会话或其他测试业务数据。
- [x] Vercel 使用独立生产环境变量连接 Supabase Cloud，模型密钥和特权密钥只在服务端可用。
- [x] 云端发布完成后，公开聊天页和嵌入入口都通过一次有据回答、引用和下线状态冒烟检查。
- [x] 发布记录包含本地门槛、真实 AI 冒烟与云端冒烟的结果，便于追溯本次上线依据。

## Comments

- 2026-08-02：按“任何潜在费用先确认”的约束，在创建任何云资源前停止。Supabase organization `wuduslxjraawimpofowk` 为 Free，新项目报价 USD 0/月；但 Vercel 官方限定 Hobby 仅供个人、非商业用途，GroundedDesk 当前商业/业务用途的最低合规自助方案为 Pro（USD 20/月起，超出月度使用额度后按量）。等待维护者明确批准付费方案或确认项目完全属于个人非商业用途。可行性依据见 [`../research/18-serverless-free-deployment-feasibility.md`](../research/18-serverless-free-deployment-feasibility.md)。未创建 Supabase/Vercel 项目，未购买域名或 SMTP。
- 2026-08-02：维护者确认 GroundedDesk 是个人、非商业 Demo，允许使用 Vercel Hobby。已在授权组织内以 Supabase Free（Singapore）和 Vercel Hobby 完成部署；未购买域名、SMTP 或任何付费附加功能，模型调用仅使用现有余额。
- 2026-08-02：最终 Production 固定为源码 `8dc3e7709f17c7545a92a2958ff627d1c0a4e78c`；五项发布证据全部通过且版本一致，发布记录见 [`../../../docs/releases/2026-08-02-8dc3e77.md`](../../../docs/releases/2026-08-02-8dc3e77.md)。

## Answer

- 真实供应商冒烟覆盖有据回答、可靠拒答和多轮追问；缺少密钥时保持明确跳过语义，普通确定性测试不受影响。
- Supabase Cloud 仅应用版本化迁移与必要初始化。额外修复托管环境函数执行权限、云端 UUID 默认值和服务角色私有校验函数权限，未推送本地种子或测试业务数据。
- Supabase Auth 使用默认 Magic Link 模板和内置邮件能力，未配置自定义 SMTP；站点 URL 与生产回调指向 Vercel HTTPS 来源。
- 同一 Vercel Production deployment 绑定两个稳定的 `vercel.app` HTTPS 来源，分别供 `APP_URL` 和 `EMBED_APP_URL` 使用；所有 API Key 仅保存在忽略的本地配置或平台 Sensitive 变量中。
- 线上知识来源更新为可核查的公开 README 引用。公开页、真实跨来源 iframe、有据回答、引用、短暂下线 404 与自动恢复发布均通过云端冒烟。
- 发布证据按同一源码版本生成，并由 `release:record` 汇总为可追溯发布记录。
