# Page Dependency Trees

## /login

Entry: `src/app/login/page.tsx`

管理员 Magic Link 登录页。

Dependencies:
- src/app/login/login-form.tsx
  - src/components/admin/brand-mark.tsx
    - src/lib/utils.ts
  - src/components/ui/alert.tsx
    - src/lib/utils.ts (already listed)
  - src/components/ui/button.tsx
    - src/lib/utils.ts (already listed)
  - src/components/ui/field.tsx
    - src/lib/utils.ts (already listed)
  - src/components/ui/input.tsx
    - src/components/ui/field.tsx (already listed)
    - src/lib/utils.ts (already listed)
- src/lib/env.ts

## /unauthorized

Entry: `src/app/unauthorized/page.tsx`

已认证但没有管理员权限时的说明页。

Dependencies:
- src/components/ui/button.tsx
  - src/lib/utils.ts

## /admin

Entry: `src/app/admin/page.tsx`

管理员概览与知识闭环状态。

Dependencies:
- src/components/admin/admin-page-header.tsx
  - src/lib/utils.ts
- src/components/admin/status-badge.tsx
  - src/components/ui/badge.tsx
    - src/lib/utils.ts (already listed)
  - src/components/ui/spinner.tsx
    - src/lib/utils.ts (already listed)
- src/components/ui/button.tsx
  - src/lib/utils.ts (already listed)
- src/lib/auth/require-admin.ts
  - src/lib/supabase/server.ts
    - src/lib/supabase/config.ts
- src/lib/time.ts

## /admin/knowledge-sources

Entry: `src/app/admin/knowledge-sources/page.tsx`

知识来源列表、状态、更新、停用与添加流程。

Dependencies:
- src/app/admin/knowledge-sources/knowledge-source-actions.tsx
  - src/app/admin/knowledge-sources/actions.ts
    - src/lib/ai/embeddings.ts
      - src/lib/ai/provider-call.ts
      - src/lib/knowledge/process-revision.ts
    - src/lib/auth/require-admin.ts
      - src/lib/supabase/server.ts
        - src/lib/supabase/config.ts
    - src/lib/knowledge/fetch-web-page.ts
      - src/lib/knowledge/extract-web-page.ts
      - src/lib/knowledge/web-address-policy.ts
    - src/lib/knowledge/process-revision.ts (already listed)
    - src/lib/knowledge/process-web.ts
      - src/lib/knowledge/fetch-web-page.ts (already listed)
      - src/lib/knowledge/process-revision.ts (already listed)
    - src/lib/knowledge/supabase-revision-repository.ts
      - src/lib/knowledge/process-revision.ts (already listed)
  - src/app/admin/knowledge-sources/manual-knowledge-source-update.tsx
    - src/app/admin/knowledge-sources/actions.ts (already listed)
    - src/components/ui/alert.tsx
      - src/lib/utils.ts
    - src/components/ui/button.tsx
      - src/lib/utils.ts (already listed)
    - src/components/ui/field.tsx
      - src/lib/utils.ts (already listed)
    - src/components/ui/input.tsx
      - src/components/ui/field.tsx (already listed)
      - src/lib/utils.ts (already listed)
    - src/components/ui/sheet.tsx
      - src/components/ui/button.tsx (already listed)
      - src/components/ui/overlay-styles.ts
      - src/lib/utils.ts (already listed)
    - src/components/ui/spinner.tsx
      - src/lib/utils.ts (already listed)
    - src/components/ui/textarea.tsx
      - src/components/ui/field.tsx (already listed)
      - src/lib/utils.ts (already listed)
  - src/components/ui/alert-dialog.tsx
    - src/components/ui/button.tsx (already listed)
    - src/components/ui/overlay-styles.ts (already listed)
    - src/lib/utils.ts (already listed)
  - src/components/ui/alert.tsx (already listed)
  - src/components/ui/button.tsx (already listed)
  - src/components/ui/spinner.tsx (already listed)
- src/app/admin/knowledge-sources/knowledge-sources-client.tsx
  - src/app/admin/knowledge-sources/actions.ts (already listed)
  - src/components/ui/alert.tsx (already listed)
  - src/components/ui/button.tsx (already listed)
  - src/components/ui/field.tsx (already listed)
  - src/components/ui/input.tsx (already listed)
  - src/components/ui/sheet.tsx (already listed)
  - src/components/ui/spinner.tsx (already listed)
  - src/components/ui/tabs.tsx
    - src/lib/utils.ts (already listed)
  - src/components/ui/textarea.tsx (already listed)
- src/app/admin/knowledge-sources/processing-status-refresh.tsx
- src/components/admin/admin-page-header.tsx
  - src/lib/utils.ts (already listed)
- src/components/admin/status-badge.tsx
  - src/components/ui/badge.tsx
    - src/lib/utils.ts (already listed)
  - src/components/ui/spinner.tsx (already listed)
- src/components/ui/empty.tsx
  - src/lib/utils.ts (already listed)
- src/lib/auth/require-admin.ts (already listed)

## /admin/assistant

Entry: `src/app/admin/assistant/page.tsx`

助手配置、预览、发布、公开链接与嵌入代码。

Dependencies:
- src/app/admin/assistant/assistant-business-configuration-form.tsx
  - src/app/admin/assistant/actions.ts
    - src/lib/assistant/business-configuration.ts
    - src/lib/auth/require-admin.ts
      - src/lib/supabase/server.ts
        - src/lib/supabase/config.ts
  - src/components/admin/admin-page-header.tsx
    - src/lib/utils.ts
  - src/components/admin/status-badge.tsx
    - src/components/ui/badge.tsx
      - src/lib/utils.ts (already listed)
    - src/components/ui/spinner.tsx
      - src/lib/utils.ts (already listed)
  - src/components/assistant/citation-list.tsx
    - src/lib/assistant/grounded-answer.ts
      - src/lib/ai/provider-call.ts
      - src/lib/assistant/question-language.ts
  - src/components/assistant/controlled-markdown.tsx
  - src/components/ui/button.tsx
    - src/lib/utils.ts (already listed)
  - src/components/ui/field.tsx
    - src/lib/utils.ts (already listed)
  - src/components/ui/input.tsx
    - src/components/ui/field.tsx (already listed)
    - src/lib/utils.ts (already listed)
  - src/components/ui/spinner.tsx (already listed)
  - src/components/ui/textarea.tsx
    - src/components/ui/field.tsx (already listed)
    - src/lib/utils.ts (already listed)
  - src/lib/assistant/business-configuration.ts (already listed)
  - src/lib/assistant/grounded-answer.ts (already listed)
  - src/lib/assistant/response-stream.ts
    - src/lib/assistant/grounded-answer.ts (already listed)
  - src/lib/utils.ts (already listed)
- src/lib/assistant/business-configuration.ts (already listed)
- src/lib/auth/require-admin.ts (already listed)
- src/lib/server-config.ts

## /a/[publicId]

Entry: `src/app/a/[publicId]/page.tsx`

访客公开聊天页；带 embedded=1 时渲染无站点顶栏的 iframe 内容。

Dependencies:
- src/app/a/[publicId]/public-conversation.tsx
  - src/app/a/[publicId]/page.tsx (already listed)
  - src/components/admin/brand-mark.tsx
    - src/lib/utils.ts
  - src/components/assistant/citation-list.tsx
    - src/lib/assistant/grounded-answer.ts
      - src/lib/ai/provider-call.ts
      - src/lib/assistant/question-language.ts
  - src/components/assistant/controlled-markdown.tsx
  - src/components/ui/button.tsx
    - src/lib/utils.ts (already listed)
  - src/components/ui/spinner.tsx
    - src/lib/utils.ts (already listed)
  - src/components/ui/textarea.tsx
    - src/components/ui/field.tsx
      - src/lib/utils.ts (already listed)
    - src/lib/utils.ts (already listed)
  - src/lib/assistant/grounded-answer.ts (already listed)
  - src/lib/assistant/public-conversation.ts
    - src/lib/assistant/grounded-answer.ts (already listed)
    - src/lib/assistant/preview-response.ts
      - src/lib/ai/provider-call.ts (already listed)
      - src/lib/assistant/grounded-answer.ts (already listed)
      - src/lib/assistant/question-language.ts (already listed)
    - src/lib/assistant/question-language.ts (already listed)
  - src/lib/assistant/response-stream.ts
    - src/lib/assistant/grounded-answer.ts (already listed)
  - src/lib/utils.ts (already listed)
- src/lib/supabase/privileged.ts
  - src/lib/supabase/config.ts

## /api/public/assistants/[publicId]/embed.js

Entry: `src/app/api/public/assistants/[publicId]/embed.js/route.ts`

客服嵌入加载器；创建右下角启动器、悬浮面板与沙箱 iframe。

Dependencies:
- src/lib/server-config.ts
- src/lib/supabase/privileged.ts
  - src/lib/supabase/config.ts
