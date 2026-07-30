# GroundedDesk

GroundedDesk 将企业可管理的知识转化为能够给出依据、允许拒答并可持续改进的智能客服。本仓库可以在全新本地环境中重建和验证完整 MVP；本地发布门槛通过前，不应连接 Supabase Cloud 或创建 Vercel 生产部署。

## 前置工具

- Git
- Docker Desktop 29 或更高版本，已启动并至少分配 7 GB 内存
- Node.js 24 或更高版本
- Corepack 启用的 pnpm 11.13（仓库固定 `pnpm@11.13.0`）

Supabase CLI 已固定为项目开发依赖，不需要全局安装。

## 环境变量与首次重建

1. 安装依赖并从安全模板创建仅供本机使用的配置：

   ```bash
   corepack enable
   pnpm install
   cp .env.example .env.local
   ```

   `.env.local` 已被 Git 忽略。不要把真实密钥写入 `.env.example` 或提交到仓库。

2. 启动本地 Supabase，并读取当前实例生成的配置：

   ```bash
   pnpm supabase:start
   pnpm exec supabase status -o env
   ```

   `.env.example` 已包含固定的本地 `API_URL` 与 `PUBLISHABLE_KEY`。把状态输出中的 `SECRET_KEY` 复制到 `.env.local` 的 `SUPABASE_SECRET_KEY`；不要使用 `ANON_KEY` 或把 secret key 添加 `NEXT_PUBLIC_` 前缀。

3. 从空数据库按时间顺序应用 `supabase/migrations/`，随后加载 `supabase/seed.sql`：

   ```bash
   pnpm db:reset
   ```

   这是破坏性的本地操作，会清空本项目的本地数据库。种子只创建演示组织、管理员和草稿助手；云端部署不得加载它。

4. 启动应用：

   ```bash
   pnpm dev
   ```

访问 [http://127.0.0.1:3000](http://127.0.0.1:3000)。登录页预填本地管理员 `admin@groundeddesk.local`。发送 Magic Link 后，在 [本地邮件查看器](http://127.0.0.1:54324) 中打开邮件。

本地 Supabase Studio 位于 [http://127.0.0.1:54323](http://127.0.0.1:54323)。

### Supabase 日常命令

| 目的 | 命令 | 数据影响 |
| --- | --- | --- |
| 启动本项目的本地服务 | `pnpm supabase:start` | 保留现有本地数据 |
| 停止本项目的本地服务 | `pnpm supabase:stop` | 保留数据卷 |
| 只应用尚未执行的本地迁移 | `pnpm db:migrate` | 不加载种子、不清空数据 |
| 从空库重放全部迁移和种子 | `pnpm db:reset` | 清空本项目本地数据库 |

## 本地发布门槛

保持 Docker 和本地 Supabase 正常运行，然后执行：

```bash
pnpm release:local
```

`pnpm test` 是同一门槛的短别名。命令按顺序完成：

1. TypeScript 类型检查与 ESLint。
2. 不访问真实供应商的确定性服务测试。
3. 清空本地数据库，重放全部迁移与演示种子。
4. 数据库集成、RLS、安全边界和数据保留测试。
5. 固定的 20 题双语检索离线评测。
6. Chromium 最高层业务场景；Playwright 自动启动确定性 Next.js 和受控网页服务。

任一步失败都会以非零状态停止，不能进入云端发布。普通门槛显式使用确定性向量、重排和回答提供器，不需要 `DEEPSEEK_API_KEY`、`SILICONFLOW_API_KEY` 或真实模型额度。

### 分层运行

| 检查 | 命令 | 是否重置数据库 | 是否消耗真实模型额度 |
| --- | --- | --- | --- |
| 类型 | `pnpm typecheck` | 否 | 否 |
| 代码规范 | `pnpm lint` | 否 | 否 |
| 确定性服务 | `pnpm test:service` | 否 | 否 |
| 数据库集成 | `pnpm test:db` | 否 | 否 |
| 检索离线评测 | `pnpm eval:retrieval` | 否 | 否 |
| 浏览器全集 | `pnpm test:e2e` | 是 | 否 |
| 已重建数据库上的浏览器全集 | `pnpm test:e2e:browser` | 否 | 否 |
| 完整本地门槛 | `pnpm release:local` | 是 | 否 |
| 按需真实 AI 冒烟 | `pnpm smoke:ai` | 否 | 是 |

运行单个数据库验收文件：

```bash
pnpm test:db supabase/tests/database/01_admin_entry.test.sql
```

运行最高层浏览器主闭环：

```bash
pnpm test:e2e -- --grep "管理员通过网页知识完成预览"
```

该场景使用真实本地 Magic Link，依次验证网页导入、等待知识来源可用、助手预览、发布、匿名公开提问、NDJSON 流式回答、点击打开引用、负面反馈、待解决问题、嵌入入口和助手下线。其余浏览器场景覆盖可靠拒答、技术故障重试、知识改进、会话复盘与删除。

## 网页知识来源

默认情况下只允许导入解析到公网地址的 HTTP/HTTPS 页面，本机、私网、保留地址和云元数据地址会在请求前被拒绝。

仅在受控本地开发中，可以显式启动私网页面开关：

```bash
ALLOW_PRIVATE_WEB_SOURCES=true DETERMINISTIC_EMBEDDINGS=true DETERMINISTIC_AI=true pnpm dev
```

另一个终端运行 `node tests/fixtures/web-knowledge-source-server.ts` 后，可以导入 `http://127.0.0.1:4173/article`。该开关在生产构建中强制失效；不要把它写入 Vercel 环境变量。Playwright 只在自己的本地 `webServer` 中设置这个开关。

## 手动测试嵌入效果

先保持 GroundedDesk 与本地 Supabase 正常运行，并在助手后台完成发布。另开一个终端启动独立宿主测试页：

```bash
pnpm dev:embed-host
```

访问 [http://127.0.0.1:4174](http://127.0.0.1:4174)，把助手后台“发布与嵌入”区域复制的代码粘贴到测试页并点击“加载悬浮入口”。测试页带有独立宿主样式和右下角人工联系入口，可用于检查悬浮入口避让、iframe 样式与脚本隔离、打开动效、匿名会话及引用。也可以在测试页填写公开助手 ID 自动生成嵌入代码。

## 检索离线评测与真实 AI 冒烟

运行固定的 20 题双语基线（10 题应获得有据回答，10 题应可靠拒答）：

```bash
pnpm eval:retrieval
```

命令读取 `.env.local` 中的 `RETRIEVAL_CANDIDATE_LIMIT`、`RERANK_EVIDENCE_LIMIT` 和 `RERANK_EVIDENCE_THRESHOLD`，输出错误拒答、错误回答、来源外事实、预期引用缺失、非预期引用、语言不匹配与技术错误。任一契约失败时命令以非零状态退出。

需要保存机器可读摘要以比较配置变化时运行：

```bash
pnpm eval:retrieval -- --json
```

调整三项检索配置时应比较整组摘要，不为单个问题添加特例。离线评测使用固定候选与供应商结果，不调用真实模型，也不消耗额度。

真实 AI 冒烟只检查当前 DeepSeek 回答与 SiliconFlow 向量、重排连接，不代替确定性发布门槛。先在 `.env.local` 填写两个 API Key，并在确认会产生真实费用后显式开启：

```bash
RUN_LIVE_AI_SMOKE=true pnpm smoke:ai
```

没有显式开关时命令会在任何供应商请求前失败；`pnpm test` 和 `pnpm release:local` 永远不会调用它。

## 配置边界

`.env.example` 明确区分两类配置：

- `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 可以进入浏览器包；数据库 RLS 是最终授权边界。
- `SUPABASE_SECRET_KEY`、`DEEPSEEK_API_KEY`、`SILICONFLOW_API_KEY`、`ADMIN_EMAIL`、`APP_URL` 和 `EMBED_APP_URL` 仅供服务端使用，禁止添加 `NEXT_PUBLIC_` 前缀；生产环境的 `EMBED_APP_URL` 必须使用与 `APP_URL` 不同的来源，以隔离 iframe 与宿主脚本。
- `RETRIEVAL_CANDIDATE_LIMIT`、`RERANK_EVIDENCE_LIMIT` 与 `RERANK_EVIDENCE_THRESHOLD` 是统一的服务端检索配置，由整组离线评测校准，不向管理员界面开放。
- `PUBLIC_DAILY_MESSAGE_BUDGET` 控制公开助手每天最多接受的 AI 请求数；不调用 AI 供应商的受控回应不占用该预算，达到上限后事实咨询不再调用模型并保留人工联系入口。
- `PUBLIC_CONVERSATION_CONTEXT_MESSAGES` 控制追问最多携带的近期消息数，取值范围为 `2`–`20`；至少保留最近一组访客主题与助手结果，以支持一次澄清后的重新检索。历史消息只用于理解追问，每个事实性问题仍会重新检索知识来源。

本地环境使用 `supabase/config.toml`、固定本地端口和演示种子。云端环境只共享迁移与应用代码，不应上传 `supabase/seed.sql` 中的演示身份或复制本地业务数据；云端密钥必须在部署平台单独配置。

## 本地门槛通过后连接云端

只有最近一次 `pnpm release:local` 完整通过后，才执行以下步骤：

1. 创建空的 Supabase Cloud 项目，使用 `pnpm exec supabase link --project-ref <project-ref>` 连接；先运行 `pnpm exec supabase db push --dry-run` 核对迁移，再运行 `pnpm exec supabase db push`。不要添加 `--include-seed`。
2. 在 Supabase Auth 中把生产主站和独立嵌入来源的 `/auth/confirm` 加入允许的重定向地址，并保持种子管理员不进入云端。
3. 在 Vercel 从 Git 仓库导入 Next.js 项目；分别为 Preview 与 Production 配置 `.env.example` 中的公开和服务端变量。密钥使用各环境自己的 Supabase 与 AI 供应商值。
4. 为 `APP_URL` 配置后台/公开页面来源，为 `EMBED_APP_URL` 配置不同来源的嵌入页面部署；两个来源使用同一套迁移后的云端数据，但不能共享浏览器来源。
5. 在 Vercel 创建生产部署前重新核对 `ALLOW_PRIVATE_WEB_SOURCES` 未配置、确定性供应商未启用，并在 Supabase 确认 `grounded-desk-daily-retention` 定时任务有效。

Supabase CLI 与 Vercel Git 部署的后续操作分别参考 [Supabase CLI 文档](https://supabase.com/docs/guides/local-development/cli/getting-started) 和 [Vercel Git 部署文档](https://vercel.com/docs/deployments/git)。

## 数据保留

- 访客会话及其消息、引用、质量反馈和关联待解决问题从最后活动时间起保留 30 天，随后通过外键级联删除。
- 不含提示词、回答正文、API Key 或 IP 画像的模型调用日志同样保留 30 天。
- 数据库迁移会启用 `pg_cron`，并注册 `grounded-desk-daily-retention` 任务，每天 UTC 03:15 执行清理。部署后应确认该任务处于启用状态，并监控 `cron.job_run_details` 中的失败记录。

## 数据库约束

- `organizations` 是业务隔离边界。
- `organization_members` 保存管理员授权，不使用可由用户修改的 `user_metadata` 做授权。
- 所有当前业务表都启用 RLS；已认证身份还必须具有对应组织成员关系。
- 匿名角色没有业务表 Data API 权限。
- 助手、会话与待解决问题通过组织外键避免跨组织引用。
