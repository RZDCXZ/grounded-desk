# 01 — 建立可重建的管理员入口

**What to build:** 开发者可以从空环境启动本地 GroundedDesk，预配置管理员通过真实 Magic Link 进入受组织成员关系保护的后台，并看到种子创建的草稿助手与系统概览。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] 新环境按项目说明安装前置工具后，可用标准命令启动本地 Supabase、应用迁移、种子数据和 Next.js。
- [x] 从空数据库执行全部迁移和种子后，会创建演示组织、唯一管理员成员关系以及默认草稿助手。
- [x] 预配置管理员可以从本地邮件查看器取得 Magic Link 并进入后台；其他已认证但不属于组织的身份会被拒绝。
- [x] 后台导航只包含概览、知识来源、助手、会话和待解决问题，概览能显示助手发布状态及初始统计值。
- [x] 本地与云端配置明确分离，Supabase 特权密钥和模型供应商密钥不会暴露给浏览器。
- [x] 自动化检查能够证明数据库可重建、管理员授权有效且未授权身份无法读取组织数据。

## Answer

- 建立 Next.js 16、TypeScript、Tailwind CSS 与本地 Supabase 工程，并在 README 中记录安装、空库重建、启动和测试命令。
- 迁移与种子创建唯一演示组织、管理员成员关系、默认草稿助手，以及概览初始统计所需的组织归属表。
- 使用真实 Supabase Magic Link、Mailpit、本地自定义邮件模板、SSR cookie 与组织成员关系二次授权保护后台。
- 实现符合设计系统的五项后台导航与概览，显示草稿助手、00 初始统计和组织/RLS 系统基线。
- 使用 pgTAP 验证种子、RLS、管理员可读、已认证非成员不可读和匿名角色不可直读；使用 Playwright 验证未登录重定向及真实 Magic Link 完整闭环。
- 2026-07-27 验证通过：`pnpm test`、`pnpm build`、Supabase security/performance advisors（无 warn/error）。
