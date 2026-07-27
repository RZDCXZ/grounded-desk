# GroundedDesk

GroundedDesk 将企业可管理的知识转化为能够给出依据、允许拒答并可持续改进的智能客服。本仓库当前提供可重建的本地管理员入口：真实 Supabase Magic Link、组织成员关系与 RLS，以及种子创建的草稿助手概览。

## 前置工具

- Docker Desktop 29 或更高版本，至少分配 7 GB 内存
- Node.js 24 或更高版本
- pnpm 11.13

Supabase CLI 已固定为项目开发依赖，不需要全局安装。

## 本地启动

1. 安装依赖并创建本地环境文件：

   ```bash
   pnpm install
   cp .env.example .env.local
   ```

2. 启动本地 Supabase：

   ```bash
   pnpm supabase:start
   ```

3. 从空数据库应用全部迁移与种子：

   ```bash
   pnpm db:reset
   ```

4. 启动 Next.js：

   ```bash
   pnpm dev
   ```

访问 [http://127.0.0.1:3000](http://127.0.0.1:3000)。登录页预填本地管理员 `admin@groundeddesk.local`。发送 Magic Link 后，在 [本地邮件查看器](http://127.0.0.1:54324) 中打开邮件。

本地 Supabase Studio 位于 [http://127.0.0.1:54323](http://127.0.0.1:54323)。

## 自动化检查

运行单个数据库验收文件：

```bash
pnpm test:db supabase/tests/database/01_admin_entry.test.sql
```

运行管理员入口浏览器闭环：

```bash
pnpm test:e2e tests/e2e/admin-entry.spec.ts
```

运行完整检查：

```bash
pnpm test
```

完整检查会依次执行类型检查、lint、空库重建、数据库 RLS 测试和 Playwright Magic Link 闭环。

## 配置边界

`.env.example` 明确区分两类配置：

- `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 可以进入浏览器包；数据库 RLS 是最终授权边界。
- `SUPABASE_SECRET_KEY`、`DEEPSEEK_API_KEY`、`SILICONFLOW_API_KEY`、`ADMIN_EMAIL` 和 `APP_URL` 仅供服务端使用，禁止添加 `NEXT_PUBLIC_` 前缀。

本地环境使用 `supabase/config.toml`、固定本地端口和演示种子。云端环境只共享迁移与应用代码，不应上传 `supabase/seed.sql` 中的演示身份或复制本地业务数据；云端密钥必须在部署平台单独配置。

`SUPABASE_SECRET_KEY` 可以从 `pnpm exec supabase status` 的本地输出复制到 `.env.local`。当前管理员入口本身不需要该特权密钥；它预留给仅在服务端运行的后续管理流程。

## 数据库约束

- `organizations` 是业务隔离边界。
- `organization_members` 保存管理员授权，不使用可由用户修改的 `user_metadata` 做授权。
- 所有当前业务表都启用 RLS；已认证身份还必须具有对应组织成员关系。
- 匿名角色没有业务表 Data API 权限。
- 助手、会话与待解决问题通过组织外键避免跨组织引用。
