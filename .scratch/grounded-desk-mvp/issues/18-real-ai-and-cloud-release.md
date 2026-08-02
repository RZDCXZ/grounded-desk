# 18 — 完成真实模型与云端发布验证

**What to build:** 项目维护者可以用真实供应商验证完整检索增强生成链路，再将已验证的迁移和应用发布到 Supabase Cloud 与 Vercel，并完成公开体验冒烟检查。

**Blocked by:** 17 — 通过本地 MVP 发布门槛.

**Status:** claimed

- [ ] 独立真实 AI 冒烟命令调用硅基流动 Embedding、Rerank 和 DeepSeek，完成至少一个有据回答、一个可靠拒答和一次多轮追问。
- [ ] 有据回答引用预期知识来源，可靠拒答不添加来源外事实，真实供应商调用失败时输出可诊断结果。
- [ ] 缺少模型密钥时真实冒烟测试明确报告跳过，不会伪装成成功，也不会阻塞普通确定性测试。
- [ ] Supabase Cloud 只接收版本化迁移、配置和必要种子，不复制本地知识来源、会话或其他测试业务数据。
- [ ] Vercel 使用独立生产环境变量连接 Supabase Cloud，模型密钥和特权密钥只在服务端可用。
- [ ] 云端发布完成后，公开聊天页和嵌入入口都通过一次有据回答、引用和下线状态冒烟检查。
- [ ] 发布记录包含本地门槛、真实 AI 冒烟与云端冒烟的结果，便于追溯本次上线依据。

## Comments

- 2026-08-02：按“任何潜在费用先确认”的约束，在创建任何云资源前停止。Supabase organization `wuduslxjraawimpofowk` 为 Free，新项目报价 USD 0/月；但 Vercel 官方限定 Hobby 仅供个人、非商业用途，GroundedDesk 当前商业/业务用途的最低合规自助方案为 Pro（USD 20/月起，超出月度使用额度后按量）。等待维护者明确批准付费方案或确认项目完全属于个人非商业用途。可行性依据见 [`../research/18-serverless-free-deployment-feasibility.md`](../research/18-serverless-free-deployment-feasibility.md)。未创建 Supabase/Vercel 项目，未购买域名或 SMTP。
