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

   这是破坏性的本地操作，会清空本项目的本地数据库。种子会创建演示组织、管理员、草稿助手，以及覆盖产品、知识管理、网站接入、支持费用和数据安全的 5 个知识来源（20 个内容单元）；云端部署不得加载它。

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

正式上线时先提交待发布代码，并让五项发布证据绑定同一个 40 位 Git SHA：

```bash
export RELEASE_EVIDENCE_DIR=.release-evidence
export RELEASE_SOURCE_REVISION=<40-character-git-sha>
pnpm release:local
```

`.release-evidence/` 已被 Git 忽略。未设置该目录时命令只执行门槛，不写发布证据。

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
| 按需真实 AI 完整链路冒烟 | `pnpm smoke:ai` | 否 | 是 |
| Supabase Cloud 发布预检 | `pnpm release:cloud:preflight` | 否 | 否 |
| Supabase Cloud 发布 | `pnpm release:cloud` | 否 | 否 |
| 云端公开体验冒烟 | `pnpm smoke:cloud` | 否 | 是 |

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

命令读取 `.env.local` 中的 `RETRIEVAL_CANDIDATE_LIMIT`、`RERANK_EVIDENCE_LIMIT` 和 `RERANK_NOISE_FLOOR`，输出错误拒答、错误回答、来源外事实、预期引用缺失、非预期引用、语言不匹配与技术错误。重排只负责排序和剔除低质量噪声，证据充分性由独立覆盖判定决定。任一契约失败时命令以非零状态退出。

需要保存机器可读摘要以比较配置变化时运行：

```bash
pnpm eval:retrieval -- --json
```

调整三项检索配置时应比较整组摘要，不为单个问题添加特例。离线评测使用固定候选与供应商结果，不调用真实模型，也不消耗额度。

真实 AI 冒烟使用脚本内两项知识内容，不写数据库；它先用 SiliconFlow 生成知识与问题向量，再执行候选召回和 Rerank，并用 DeepSeek 完成证据覆盖与有据回答。命令必须同时通过一个引用预期知识来源的有据回答、一个不生成正文或引用的可靠拒答，以及一次携带近期会话但重新检索的追问。它不代替确定性发布门槛。

先在 `.env.local` 填写两个 API Key，并在确认会产生真实费用后显式开启：

```bash
RUN_LIVE_AI_SMOKE=true pnpm smoke:ai
```

没有显式开关时命令会在任何供应商请求前失败。显式开启但缺少任一模型密钥时，命令输出“已跳过”并以零状态结束，不输出“通过”；发布记录会拒绝 `skipped` 证据。供应商调用失败时输出阶段、provider、model、errorType 和 traceId，不打印 API Key。`pnpm test` 和 `pnpm release:local` 永远不会调用真实模型。

## 配置边界

`.env.example` 用于本地环境，`.env.production.example` 是维护者本机执行 Cloud 发布与冒烟的无密钥模板。两者明确区分两类配置：

- `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 可以进入浏览器包；数据库 RLS 是最终授权边界。
- `SUPABASE_SECRET_KEY`、`DEEPSEEK_API_KEY`、`SILICONFLOW_API_KEY`、`ADMIN_EMAIL`、`APP_URL` 和 `EMBED_APP_URL` 仅供服务端使用，禁止添加 `NEXT_PUBLIC_` 前缀；生产环境的 `EMBED_APP_URL` 必须使用与 `APP_URL` 不同的来源，以隔离 iframe 与宿主脚本。
- `RETRIEVAL_CANDIDATE_LIMIT`、`RERANK_EVIDENCE_LIMIT` 与 `RERANK_NOISE_FLOOR` 是统一的服务端检索配置，由整组离线评测校准，不向管理员界面开放；噪声下限不能直接决定可靠拒答。
- `PUBLIC_DAILY_MESSAGE_BUDGET` 控制公开助手每天最多接受的 AI 请求数；不调用 AI 供应商的受控回应不占用该预算，达到上限后事实咨询不再调用模型并保留人工联系入口。
- `PUBLIC_CONVERSATION_CONTEXT_MESSAGES` 控制追问最多携带的近期消息数，取值范围为 `6`–`20`；至少保留两轮澄清所需的访客消息与助手结果。历史消息只用于理解追问，每个事实性问题仍会重新检索知识来源。

本地环境使用 `supabase/config.toml`、固定本地端口和演示种子。云端使用 `supabase/migrations/` 与 `supabase/config.production.toml`；发布命令把生产配置渲染到临时目录后运行 `config push`，不会覆盖本地配置。`supabase/seed.sql` 永不上传；`scripts/bootstrap-cloud.ts` 只幂等创建 ADMIN_EMAIL 对应的 Auth 用户、组织成员关系和一个草稿助手，不创建知识来源、会话或其他测试业务数据。

## 本地门槛通过后连接云端

### 1. 准备同一版本的本地与真实 AI 证据

提交待发布代码，记录其完整 Git SHA，然后执行：

```bash
export RELEASE_EVIDENCE_DIR=.release-evidence
export RELEASE_SOURCE_REVISION=<40-character-git-sha>
pnpm release:local
RUN_LIVE_AI_SMOKE=true pnpm smoke:ai
```

两个命令必须都通过。缺少模型密钥产生的 `skipped` 证据不能进入发布记录。

### 2. 创建并发布 Supabase Cloud

创建空项目后，把 `.env.production.example` 复制为被 Git 忽略的 `.env.production.local` 并填入真实值。新项目应使用 `sb_publishable_…` 与 `sb_secret_…`；secret key 只在维护者本机发布命令和 Vercel 服务端使用。

Supabase 新 Free 项目如需推送自定义 Magic Link 模板，必须先配置自定义 SMTP，或使用允许模板自定义的计划。完成后运行：

```bash
pnpm release:cloud:preflight
pnpm release:cloud
```

`release:cloud` 固定执行预检、`supabase link`、`db push --dry-run`、`db push`、临时生产配置 `config push` 和必要初始化；命令中没有 `--include-seed`。随后在 Supabase 确认：

- 迁移历史与仓库一致，`grounded-desk-daily-retention` 定时任务有效；
- Auth Site URL 与两个精确 `/auth/confirm` 重定向来自生产配置；
- 只有配置的管理员、组织、成员关系和草稿助手被初始化；知识来源与会话为空。

### 3. 配置 Vercel Production

从同一 Git SHA 导入 Vercel 项目。为同一 Production 部署绑定两个不同 HTTPS 来源：`APP_URL` 用于后台、公开页和 embed.js，`EMBED_APP_URL` 用于 iframe 页面。每次环境变量变更后必须重新部署，因为旧 deployment 不会自动获得新值。

只把以下两项作为可公开变量：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

`SUPABASE_SECRET_KEY`、`DEEPSEEK_API_KEY` 与 `SILICONFLOW_API_KEY` 应在 Vercel 的 Preview/Production 分别保存为 Sensitive；`ADMIN_EMAIL`、`APP_URL`、`EMBED_APP_URL` 和其余检索/预算配置也不加 `NEXT_PUBLIC_`。不要配置 `ALLOW_PRIVATE_WEB_SOURCES`，不要启用 `DETERMINISTIC_AI` 或 `DETERMINISTIC_EMBEDDINGS`。

生产部署为 READY 且主域返回成功后，用 Vercel 提供的 deployment ID、project ID 和 URL 生成部署证据：

```bash
VERCEL_DEPLOYMENT_URL=https://groundeddesk.example.com \
VERCEL_DEPLOYMENT_ID=dpl_replace_me \
VERCEL_PROJECT_ID=prj_replace_me \
pnpm release:record:vercel
```

### 4. 维护知识并执行云端公开体验冒烟

使用生产 Magic Link 登录，添加真实、公开且可引用的知识来源，等待可用后预览并发布助手。在 `.env.production.local` 填写 `CLOUD_SMOKE_QUESTION` 与 `CLOUD_SMOKE_EXPECTED_SOURCE_TITLE`，再运行：

```bash
pnpm smoke:cloud
```

命令会在公开聊天页和真实 iframe 嵌入入口各完成一次有据回答并核对引用，然后短暂把助手设为 offline，确认公开页与 embed.js 均返回 404，并在 `finally` 中恢复 published。应在低流量窗口运行；若进程被强制终止，立即到后台确认助手已重新发布。

### 5. 生成可追溯发布记录

五项证据全部来自同一个 Git SHA 后运行：

```bash
pnpm release:record
```

命令要求本地门槛、真实 AI、Supabase Cloud、Vercel Production 和云端公开体验全部为 `passed`，随后在 `docs/releases/` 生成 Markdown 记录。不同源码版本、失败或跳过结果都会阻止记录生成。

相关官方资料：[Supabase 数据库迁移](https://supabase.com/docs/guides/deployment/database-migrations)、[Supabase 配置推送](https://supabase.com/docs/reference/cli/supabase-config-push)、[Supabase API Keys](https://supabase.com/docs/guides/getting-started/api-keys)、[Vercel 环境变量](https://vercel.com/docs/environment-variables)、[Vercel Production 部署](https://vercel.com/docs/cli/deploy)。

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
