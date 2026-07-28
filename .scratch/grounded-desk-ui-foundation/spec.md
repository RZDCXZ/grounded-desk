# GroundedDesk 可访问组件基础重构规格

Status: ready-for-agent

## 背景

GroundedDesk MVP 的 01“建立可重建的管理员入口”和 02“导入并启用手工知识来源”已经完成。当前登录页、后台壳、概览、知识来源列表和添加知识来源抽屉符合 `.superdesign/design-system.md`，业务测试也已覆盖主要路径，但 Button、表单字段、状态标签、反馈信息和浮层交互仍由各业务文件直接组合 Tailwind class 与手写行为。

后续知识来源生命周期、助手配置、会话和待解决问题页面会重复这些模式。如果继续在页面中复制实现，将难以保持尺寸、状态、焦点管理、键盘交互和 Client Component 边界一致。

本次重构引入 shadcn 作为可访问交互原语和组件源码分发方式，但不引入 shadcn 默认品牌视觉。`.superdesign/design-system.md` 仍是唯一视觉规范，对应页面的 `.superdesign/*.html` 仅作为布局与交互参考。

## 目标

1. 减少后续页面重复的 Button、字段、Badge、反馈信息和浮层 Tailwind class。
2. 统一 Button、表单、Badge、Sheet、Dialog、AlertDialog、Tabs 等交互语义。
3. 保持 MVP 01/02 的用户可观察业务行为不变。
4. 将 GroundedDesk 的颜色、排版、尺寸、圆角、边框、阴影和动效落实为基础组件的唯一视觉。
5. 保持 Server Component 为默认，只把状态与浏览器交互放入最小客户端叶节点。

## 非目标

- 不实现 MVP 03 或 06 的新业务能力。
- 不重写数据库、认证、组织权限、数据获取、Server Action、知识处理或轮询规则。
- 不建立暗色主题、通用主题 Provider、国际化框架或复杂表单框架。
- 不把 Metric Card、闭环步骤、系统基线、知识来源行等单一用例展示结构提前抽象为通用组件。
- 不为了匹配 shadcn 示例引入默认中性色板、默认字体、默认圆角、默认阴影或品牌风格。
- 不新增自动化可访问性审计框架。

## 已确认的架构决策

### 组件源码所有权

- `src/components/ui/` 保存无业务语义的基础组件源码。
- shadcn 只提供可访问结构、交互原语和初始源码；源码加入仓库后由 GroundedDesk 维护。
- 基础组件可以直接按设计系统修改，不为每个 shadcn 组件增加无意义 wrapper。
- `ui/` 只暴露 `variant`、`size`、`invalid` 等通用能力，不出现知识来源、可靠拒答等业务概念。
- 产品状态到视觉变体的映射位于产品组件层。
- 上游更新必须通过 shadcn CLI 的 dry-run/diff 逐文件审查合并，不直接覆盖本地修改。

### 原语基座

按照 [ADR-0004](../../docs/adr/0004-use-radix-as-shadcn-primitive-base.md)，基础组件采用：

- Radix 原语；
- Lucide 图标；
- CSS Variables；
- Tailwind CSS v4；
- RSC 模式。

实现时使用仓库声明的 pnpm 包运行器调用 shadcn CLI。初始化和添加组件前应查看当前项目信息与对应组件文档，并审查 CLI 将修改的文件；不得使用未经确认的覆盖操作。

### 视觉令牌

保留设计系统现有精确色值和命名：

- `paper`、`surface`
- `forest-950`、`forest-800`、`forest-100`
- `ink-900`、`ink-600`、`ink-400`
- `line`、`line-strong`
- success、processing、warning、danger、info 及其浅色背景

在现有 `src/app/globals.css` 中通过 Tailwind v4 `@theme inline` 增加 shadcn 所需的语义别名：

| 语义令牌 | GroundedDesk 来源 |
| --- | --- |
| background | paper |
| foreground | ink-900 |
| card / popover | surface |
| muted | paper |
| muted-foreground | ink-600 |
| primary | forest-800 |
| primary-foreground | surface |
| secondary / accent | surface 或 forest-100，按组件状态确定 |
| border | line |
| input | line-strong |
| ring | forest-800 |
| destructive | danger |

success、processing、warning、danger 和 info 继续作为并列的产品状态令牌，不能全部退化为 `destructive`。控件圆角为 8px，卡片圆角为 12px，标签圆角为 999px；不采用 shadcn 默认圆角比例。本次不定义暗色主题。

## 首批组件边界

### 基础组件

`src/components/ui/` 首批只包含：

- `button`：主、次、幽灵、危险描边、危险确认；支持 34、40、44px 高度及图标按钮。
- `input`、`textarea`、`field`：统一标签、说明、错误、禁用、`data-invalid` 与 `aria-invalid`。
- `badge`：提供 neutral、success、processing、warning、danger、info 视觉变体。
- `alert`：承载成功、错误和说明反馈，并由调用者提供正确的 live-region 语义。
- `sheet`、`dialog`、`alert-dialog`：提供统一浮层结构与可访问标题。
- `tabs`：替代知识来源表单中的手写 tab 结构。
- `separator`、`spinner`、`empty`：统一分隔线、忙碌状态和空状态。

Button 内图标使用组件约定的 `data-icon` 位置，不由页面重复指定尺寸。表单使用 `FieldGroup` 与 `Field` 组合；Dialog、Sheet 和 AlertDialog 必须包含相应 Title，需要隐藏时使用 `sr-only`。

### 产品组件

- `AdminPageHeader`：后台页面标题、说明和右侧动作区域。
- `StatusBadge`：把草稿、已发布、已下线、处理中、可用、失败、已停用、待处理和已解决映射到 Badge 变体、文字状态点或 Spinner。
- `BrandMark`：登录页与后台导航共用的 GroundedDesk 字标。
- `AdminNavigationClient`：当前导航项和移动端导航 Sheet。

只有出现第二个真实用例时，才继续提炼 Card、Table、Metric Card 或其他展示组件。

## 浮层分类

- **Sheet**：从当前页面发起、需要较多表单空间、关闭后回到原上下文的任务；添加或编辑知识来源以及移动后台导航使用 Sheet。
- **Dialog**：短小、聚焦、非破坏性的确认或查看任务，不承载长表单。
- **AlertDialog**：删除、下线等有显著后果且必须明确确认的动作。
- **Popover / DropdownMenu**：轻量选择或附属操作，不承载提交型业务流程。

业务页面不得自行实现遮罩、焦点限制、Escape 关闭或浮层层级。所有 Sheet、Dialog 和 AlertDialog 都必须有可访问标题与说明；关闭后焦点返回触发器，并支持键盘操作与减少动态效果。

## Client Component 边界

采用“服务端默认、交互叶节点客户端化”：

- `page.tsx`、`layout.tsx`、页面标题、卡片、表格和状态展示保持 Server Component。
- `src/components/ui/` 中只有依赖状态、浏览器 API 或 Radix 客户端交互的模块声明 `"use client"`。
- `AdminShell` 拆为服务端壳与 `AdminNavigationClient`，避免整个后台壳因移动导航和 `usePathname` 成为客户端模块。
- `AddKnowledgeSourceSheet` 负责开关状态、`useActionState` 和成功后的刷新。
- `ProcessingStatusRefresh` 只负责定时刷新。
- `LoginForm` 保留现有请求与提交状态。
- 不建立全局 UI Context。
- 传入客户端组件的数据必须最小且可序列化；数据库客户端、完整服务端对象和 server-only 依赖不得越界。

Server Component 可以组合 Client Component；这不要求包含它的页面变为客户端模块。

## 行为兼容契约

必须保持：

- 路由、认证、组织权限和 Server Action 不变。
- 表单字段名、必填规则、长度限制、提交结果和失败文案不变。
- 知识来源继续按“处理中 → 可用/失败”刷新，概览数量继续同步更新。
- 按钮、链接、标题、字段、状态和浮层保持相同的用户可见名称与可访问名称。
- 现有 Playwright 业务路径不得因 CSS 或内部 DOM 层级变化而降低断言强度。
- 文案和业务状态语义不借重构调整。

允许改变：

- 内部 DOM 包装层、Portal 位置和 Tailwind class。
- 为正确可访问性新增的 `aria-*`、描述关联、焦点保护和 Escape 行为。
- 依赖错误 DOM 细节的测试可以改为 role/name 等用户视角定位，但不能减少业务断言。

## 迁移策略

本工作项在一个 PR 中完成，但按以下可验证提交推进：

1. **建立基线**
   - 运行当前完整测试与 build。
   - 保存登录、概览、知识来源、打开添加知识来源浮层的 1440px 与 360px 对照截图。
2. **建立基础层**
   - 初始化 `components.json`、Radix 依赖、`cn()`、语义令牌和首批 `ui/` 组件。
   - 审查初始化对 `globals.css` 和依赖的修改，保留现有设计令牌。
   - 暂不改业务页面。
3. **迁移静态共享层**
   - 迁移 BrandMark、Button、Badge、Alert、Empty 和 AdminPageHeader。
   - 页面继续保持 Server Component。
4. **收紧客户端边界**
   - 拆分 AdminShell。
   - 迁移桌面当前导航与移动导航 Sheet。
5. **迁移表单浮层**
   - 将添加知识来源迁移为 Sheet、Tabs、Field、Input、Textarea 和 Spinner 组合。
   - 保留 Server Action、字段名、校验、提交状态与刷新行为。
6. **清理与验收**
   - 删除被替代的手写遮罩、焦点逻辑、重复 class 和无用导入。
   - 运行完整验证并对照基线截图。

每一阶段至少通过 typecheck 与 lint；涉及具体路由的阶段还必须运行对应 E2E。

## 验收标准

### 自动化与业务回归

- `pnpm typecheck`、`pnpm lint`、service tests、database tests、E2E、`pnpm build` 全部通过。
- MVP 01/02 的现有 Playwright 业务断言保持或增强。
- 不新增 `@axe-core/playwright` 或其他自动化可访问性审计依赖。

### 原生 Playwright 可访问性交互

- 浮层具有 `dialog` 角色、可访问标题和说明。
- 键盘可以打开浮层，Tab 不离开 Sheet，Escape 可以关闭。
- Sheet 关闭后焦点返回触发按钮。
- 当前导航使用 `aria-current="page"`。
- 360px 下移动导航、表单和主要操作完整可用。
- 主要交互目标至少为 40×40px。
- 状态、错误和反馈都有可读文字，不只依赖颜色。

验收结论表述为“覆盖本次交互的可访问性回归检查通过”，不声称完成完整 WCAG 自动审计。

### 结构

- `page.tsx` 与 `layout.tsx` 不出现 `"use client"`。
- 产品客户端组件只负责导航、表单 Sheet、登录状态和轮询。
- 客户端组件不接收数据库客户端或完整服务端对象。
- Button、字段、Badge、Alert 和浮层不再由业务页面重复实现视觉 class。
- 业务页面传给基础组件的 `className` 只用于布局，不覆盖组件颜色和字体。

### 视觉

- 1440px 与 360px 对照截图没有结构性漂移。
- 颜色、字号、控件高度、圆角、边框、阴影和焦点环符合 `.superdesign/design-system.md`。
- 不出现 shadcn 默认中性色品牌外观、渐变、新阴影或暗色主题。
- 允许因正确焦点管理、Portal 和可访问描述产生非视觉 DOM 变化。

## 实施顺序

本工作项以已解决的 GroundedDesk MVP 01/02 为基线，应在继续实现 MVP 03 及后续页面前完成，避免新页面继续复制旧的交互与样式实现。
