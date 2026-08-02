# 18 — Serverless 免费优先部署可行性

**核验日期：** 2026-08-02  
**资料范围：** 仅使用 Vercel、Supabase 官方文档、价格页、服务条款与官方变更日志。  
**操作边界：** 本次仅研究；未创建、升级或修改任何云资源。

## 结论

1. **不能按 Vercel Hobby 继续部署已描述为商业/业务场景的 GroundedDesk。** Vercel 的服务条款只允许 Hobby 用于个人或非商业用途；Fair Use 进一步规定，所有商业用途都需要 Pro 或 Enterprise，并将“为任何项目参与者带来经济收益”列为商业用途。按当前用途描述，不能把 Hobby 当作合规方案；若实际用途确实是完全个人、无报酬、无经济收益的演示，才可能落入 Hobby，边界不清时应先向 Vercel Support 取得确认。[Vercel 服务条款 §4](https://vercel.com/legal/terms)、[Vercel Fair Use — Commercial usage](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)、[Vercel Hobby 文档](https://vercel.com/docs/plans/hobby)
2. **最低自助付费方案是 Vercel Pro，确定性最低订阅成本为 USD 20/月。** 该平台费包含 1 个可部署席位和每月 USD 20 基础设施使用额度；额外 Owner/Member 席位各 USD 20/月。额度用完后会转入 on-demand 按量计费，因此 USD 20 不是绝对费用上限。[Vercel Pro 定价说明](https://vercel.com/docs/plans/pro-plan#pro-plan-pricing)、[Vercel 价格页](https://vercel.com/pricing)
3. **因此已触发用户的停止条件：在用户另行明确批准 Pro 的 USD 20/月订阅及按量风险前，不应创建 Vercel GroundedDesk 项目，也不应开始云部署。** Pro 新客户的 Spend Management 默认通知金额为每计费周期 USD 200；这不是免费额度或自动硬上限。若日后获批，必须主动配置硬限制/暂停动作，且该机制不覆盖席位和单独付费附加项。[Vercel Pro — Managing your spend amount](https://vercel.com/docs/plans/pro-plan#managing-your-spend-amount)、[Vercel Spend Management](https://vercel.com/docs/spend-management)
4. **两个稳定的 `*.vercel.app` Production 来源在技术上可以尝试，但需以实际可用性验证为准。** 官方说明项目会获得一个 `vercel.app` 域名，可以选择可用的 `vercel.app` 名称，项目可配置多个域名；项目域名会自动指向最新 Production deployment。因此可尝试添加两个不重定向、名称可用的 `*.vercel.app` 项目域名，分别作为 `APP_URL` 与 `EMBED_APP_URL`，无需购买域名。名称按先到先得分配且不可保留，官方没有保证任意第二个名称一定可用；如果恢复部署后第二个项目域名无法配置或无法以 HTTPS 指向同一 Production deployment，应按用户要求停止。[Vercel Working with domains](https://vercel.com/docs/domains/working-with-domains)、[Vercel 添加域名指南](https://vercel.com/kb/guide/how-do-i-add-a-custom-domain-to-my-vercel-project)、[Vercel Production 域名分配](https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting)
5. **不要用作者 URL 或唯一部署 URL冒充第二个长期稳定 Production 来源。** Team 作者 URL跟踪该成员的最新变更；唯一部署 URL只在部署保留策略允许的期间可访问。它们不等同于两个长期项目 Production 域名。[Vercel Generated URLs](https://vercel.com/docs/deployments/generated-urls)
6. **Supabase Free + Singapore 本身可以是 USD 0，但必须先确认目标 organization 仍为 Free 且有免费项目名额。** Supabase 按 organization 订阅计费，一个 organization 内不能混用 Free 与付费计划；Free 允许跨用户拥有/管理的 organization 合计最多 2 个活跃免费项目。若 `wuduslxjraawimpofowk` 是 Free 且仍有名额，新建 Nano Free 项目为 USD 0；若该 organization 已是付费计划，不能在其中创建“Free 项目”，应停止而不是产生计算费用或擅自另建 organization。[Supabase Billing](https://supabase.com/docs/guides/platform/billing-on-supabase)、[Supabase Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk)、[Supabase Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)
7. **Singapore 是 Supabase 官方支持区域，Free 页面没有列出区域附加费。** 可选一般区域 `Southeast Asia (Singapore)`，也可选具体 AWS 区域 `ap-southeast-1`；Free 价格为 USD 0/月。由这两份官方资料可推断，在满足上一条组织/名额条件时，选择 Singapore 不会单独触发订阅费用。[Supabase Regions](https://supabase.com/docs/guides/platform/regions)、[Supabase Pricing](https://supabase.com/pricing)
8. **新建 Supabase Free 项目使用默认 Magic Link 模板是正确且必要的零成本选择。** 自 2026-06-03 起，新 Free 项目只要使用 Supabase 默认邮件服务，就不能修改 Auth 邮件模板；默认 confirmation、password reset、Magic Link 等模板原样使用。Free 项目只有配置自己的 SMTP 后才能再次自定义模板。[Supabase 2026-06-03 官方变更](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
9. **默认 SMTP 只能支撑受限的管理员演示，不能视为生产邮件服务。** 未配置自有 SMTP 时，Supabase 只向该项目 organization 的 Team 成员邮箱投递；当前限制为每小时 2 封，额度可随时调整，没有送达或可用性 SLA，官方仅建议用于探索、演示或非关键应用。因此 `ADMIN_EMAIL` 必须替换成真实邮箱，且该邮箱必须已经是 organization Team 成员，否则 Magic Link 会失败。若要给任意外部用户发送 Auth 邮件，需要自有 SMTP；本方案不购买 SMTP，所以不能承诺该能力。[Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

## Vercel 判断细节

### Hobby 是否允许本项目

官方判断边界不是“有没有收费按钮”，而是 deployment 是否用于经济收益。Fair Use 明确包括由受薪员工或顾问编写的项目，并列出商业销售/宣传、受偿建站维护托管、广告与主要用于联盟链接等情形。当前任务将 GroundedDesk 定位为面向商业/业务场景的应用，故不能在未获得 Vercel 明确认可时用 Hobby 承载。[Vercel Fair Use](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)

| 方案 | 固定费用 | 使用费用 | 对当前任务的判断 |
| --- | ---: | --- | --- |
| Hobby | USD 0/月 | 达到免费限制后通常等待额度恢复，不提供商业使用权 | 不适用当前商业/业务用途 |
| Pro | USD 20/月平台费，含 1 个部署席位 | 含每月 USD 20 使用额度；超出后按量计费 | 最低合规自助方案，但尚未获付费批准 |
| Enterprise | 定制 | 定制 | 不是最低成本方案 |

来源：[Vercel Hobby](https://vercel.com/docs/plans/hobby)、[Vercel Pro](https://vercel.com/docs/plans/pro-plan)、[Vercel Pricing](https://vercel.com/pricing)。

### 两个 `vercel.app` 来源

可接受的目标形态是两个不同 host、均不做重定向、均由 Vercel 自动提供 TLS，并都列在同一项目的 Production domains/aliases 中。例如只表达结构、不预占名称：

- `https://grounded-desk.vercel.app`
- `https://grounded-desk-embed.vercel.app`

恢复部署后的验证条件应同时满足：

- 两个名称均可用并归属目标 Vercel team/project；
- 两个 URL 都是 HTTPS 且返回同一 Production deployment；
- 两个 host 的 Origin 确实不同；
- 第二个 URL 不是 redirect、作者追踪 URL、branch preview URL，亦不是受 retention policy 约束的唯一部署 URL；
- Vercel API 返回的 project ID、deployment ID、Production 状态与当前 Git SHA 相符。

官方文档足以支持“可以尝试配置”的结论，但没有对任意两个自选 `vercel.app` 名称作可用性保证。因此这仍是一项部署时必须实测的门槛，而不是创建项目前可以绝对保证的事实。[Vercel Generated URLs](https://vercel.com/docs/deployments/generated-urls)、[Vercel Domains](https://vercel.com/docs/domains/working-with-domains)

## Supabase Free 与本项目直接相关的限制

| 项目 | Free 额度/行为 | 对 GroundedDesk 的影响 |
| --- | --- | --- |
| 活跃项目 | 最多 2 个，按用户作为 Owner/Admin 参与的所有 organization 合计；暂停项目不计入 | 创建前必须查名额与 organization 套餐 |
| 计算 | Nano 为 USD 0 | 不要选择/升级付费计算规格 |
| 数据库 | 每项目 500 MB | 需要监控知识单元、会话和日志增长 |
| 月活用户 | 50,000 MAU | MVP 管理员/公开聊天量通常足够，但到限额会受限制 |
| Egress | 5 GB，另有 5 GB cached egress | 公开聊天、Supabase API/Auth 流量共同消耗配额 |
| 文件存储 | 1 GB | 当前主要是文本知识，仍需避免上传大文件 |
| 空闲暂停 | 1 周无活动后暂停 | 不是持续在线 SLA；线上冒烟前可能需要恢复项目 |
| 自动备份 | Free 不包含 | 不应把 Free 当作已有生产备份保障 |
| 超额行为 | Free 超额时通知、宽限后限制服务；Free 不按超额自动收费 | 可保持零费用，但可用性会下降而非自动扩容 |
| Auth 默认 SMTP | 仅 Team 预授权地址；当前 2 封/小时；无 SLA | 真实 `ADMIN_EMAIL` 必须是 Team 成员；只适合管理员演示 |
| 新 Free 邮件模板 | 默认邮件服务下禁止修改 | 不推送自定义 Magic Link 模板 |

配额来源：[Supabase Pricing](https://supabase.com/pricing)、[Supabase Billing](https://supabase.com/docs/guides/platform/billing-on-supabase)、[Supabase Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)、[Supabase Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)、[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)。

## 继续部署前的明确门槛

当前应停止在云资源创建之前。只有以下事项全部完成才可恢复：

1. 用户明确确认 GroundedDesk 是完全个人、非商业、无经济收益用途，且接受 Hobby 条款；**或**用户明确批准 Vercel Pro 至少 USD 20/月的订阅以及按量计费风险。
2. 核验 Vercel team `team_hpK3IP91o7CR79x8aM2EWCBW` 当前套餐；不得升级、开试用或购买附加项来绕过确认。
3. 核验 Supabase organization `wuduslxjraawimpofowk` 是 Free 且用户尚有活跃免费项目名额；否则停止。
4. 将 `ADMIN_EMAIL=<我的管理员邮箱>` 替换为真实、已加入该 Supabase organization Team 的邮箱；不得把占位符写入生产配置。
5. Vercel 项目获准创建后，实测两个可用的稳定 `*.vercel.app` Production 项目域名；第二个不可用即停止，不购买域名。
6. Supabase Auth 保持默认邮件模板与默认 SMTP；不推送模板路径，不购买 SMTP。

