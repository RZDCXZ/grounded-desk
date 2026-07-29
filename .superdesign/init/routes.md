# Routes

Routing: Next.js App Router（基于 `src/app` 文件系统）。

| URL | Entry | Layout | Summary |
| --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | `src/app/layout.tsx` | 根入口，仅重定向到管理员概览。 |
| `/login` | `src/app/login/page.tsx` | `src/app/layout.tsx` | 管理员 Magic Link 登录页。 |
| `/unauthorized` | `src/app/unauthorized/page.tsx` | `src/app/layout.tsx` | 已认证但没有管理员权限时的说明页。 |
| `/admin` | `src/app/admin/page.tsx` | `src/app/admin/layout.tsx` | 管理员概览与知识闭环状态。 |
| `/admin/knowledge-sources` | `src/app/admin/knowledge-sources/page.tsx` | `src/app/admin/layout.tsx` | 知识来源列表、状态、更新、停用与添加流程。 |
| `/admin/assistant` | `src/app/admin/assistant/page.tsx` | `src/app/admin/layout.tsx` | 助手配置、预览、发布、公开链接与嵌入代码。 |
| `/a/[publicId]` | `src/app/a/[publicId]/page.tsx` | `src/app/layout.tsx` | 访客公开聊天页；带 embedded=1 时渲染无站点顶栏的 iframe 内容。 |
| `/api/public/assistants/[publicId]/embed.js` | `src/app/api/public/assistants/[publicId]/embed.js/route.ts` | `宿主网站 Shadow DOM + /a/[publicId]?embedded=1 iframe` | 客服嵌入加载器；创建右下角启动器、悬浮面板与沙箱 iframe。 |
| `/a/[publicId] (not found)` | `src/app/a/[publicId]/not-found.tsx` | `src/app/layout.tsx` | 助手未发布或不存在时的公开入口不可用页。 |

当前代码尚未实现 `/admin/conversations` 与 `/admin/unresolved-questions`，但它们已经在设计系统和现有 Superdesign 画布中作为后续核心页面定义。
