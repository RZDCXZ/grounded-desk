# Extractable Components

## Layout Components

## AdminShell
- Source: `src/components/admin/admin-shell.tsx`
- Category: layout
- Description: 管理后台固定导航与内容壳层。
- Extractable props: organizationName (string), administratorEmail (string)
- Hardcoded: 侧栏尺寸、主内容区域、导航组件。

## AdminNavigation
- Source: `src/components/admin/admin-navigation-client.tsx`
- Category: layout
- Description: 桌面侧栏、移动顶栏、五项业务导航与身份区。
- Extractable props: organizationName (string), administratorEmail (string), activePath (string)
- Hardcoded: GroundedDesk 标识、导航标签、Lucide 图标、登出动作。

## AdminPageHeader
- Source: `src/components/admin/admin-page-header.tsx`
- Category: layout
- Description: 后台页面标题、说明与右侧动作。
- Extractable props: title (string), description (string), showActions (boolean)
- Hardcoded: 响应式间距、边框和背景。

## BrandMark
- Source: `src/components/admin/brand-mark.tsx`
- Category: layout
- Description: GroundedDesk 依据节点品牌标记。
- Extractable props: compact (boolean)
- Hardcoded: 品牌图形、GroundedDesk 字标与颜色。

## PublicConversation
- Source: `src/app/a/[publicId]/public-conversation.tsx`
- Category: layout
- Description: 公开聊天与 iframe 嵌入共用的完整会话体验。
- Extractable props: embedded (boolean), assistantName (string), welcomeMessage (string), serviceScope (string)
- Hardcoded: AI 身份说明、敏感信息提示、消息结构、引用、拒答与故障语义。

## EmbedLauncher
- Source: `src/app/api/public/assistants/[publicId]/embed.js/route.ts`
- Category: layout
- Description: 宿主网站右下角客服启动器、悬浮面板与 iframe。
- Extractable props: assistantName (string), open (boolean)
- Hardcoded: Shadow DOM、面板尺寸、响应式位置、打开/关闭图标和动画。

## Basic Components

## StatusBadge
- Source: `src/components/admin/status-badge.tsx`
- Category: basic
- Description: 后台业务状态的语义徽标。
- Extractable props: status (string)
- Hardcoded: 状态标签、颜色、状态点和圆角。

## CitationList
- Source: `src/components/assistant/citation-list.tsx`
- Category: basic
- Description: 助手回答下方的可核查来源列表。
- Extractable props: citations (array)
- Hardcoded: 最多三个来源、外链图标、标题与地址层级。

## ChatComposer
- Source: `src/app/a/[publicId]/public-conversation.tsx`
- Category: basic
- Description: 问题输入、发送/加载状态与隐私提示。
- Extractable props: disabled (boolean), pending (boolean), value (string)
- Hardcoded: 输入上限、标签、占位文案、敏感信息提示。
