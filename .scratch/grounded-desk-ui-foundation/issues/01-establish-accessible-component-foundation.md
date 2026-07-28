# 01 — 建立可访问组件基础并迁移既有页面

**What to build:** 开发者可以使用由 GroundedDesk 设计系统控制视觉的 shadcn/Radix 基础组件继续实现页面，而现有登录、后台概览和知识来源业务行为保持不变。

**Blocked by:** None — GroundedDesk MVP 01 与 02 已解决。

**Status:** resolved

- [x] 实施前运行当前完整测试与 build，并保存登录、概览、知识来源及打开添加知识来源浮层的 1440px 与 360px 对照截图。
- [x] 使用 pnpm 运行 shadcn CLI，按 ADR-0004 初始化 Radix、Lucide、CSS Variables、Tailwind CSS v4 和 RSC 配置，不覆盖未经审查的现有文件。
- [x] `src/app/globals.css` 保留设计系统精确色值，并通过 `@theme inline` 提供 background、foreground、card、popover、primary、border、input、ring 等语义别名。
- [x] 控件、卡片和标签圆角分别保持 8px、12px 和 999px，不引入 shadcn 默认色板、阴影、字体、暗色主题或品牌视觉。
- [x] `src/components/ui/` 提供 Button、Input、Textarea、Field、Badge、Alert、Sheet、Dialog、AlertDialog、Tabs、Separator、Spinner 和 Empty。
- [x] Button 统一主、次、幽灵、危险描边和危险确认变体及 34/40/44px 尺寸；页面不再覆盖其颜色或字体。
- [x] Field 组合统一标签、说明、错误、禁用、`data-invalid` 和 `aria-invalid`；表单字段名、约束和错误文案保持不变。
- [x] Sheet、Dialog 和 AlertDialog 都有可访问标题与说明，并由 Radix 负责遮罩、Portal、焦点限制、Escape 关闭和关闭后的焦点返回。
- [x] 产品组件层提供 AdminPageHeader、StatusBadge、BrandMark 和 AdminNavigationClient，不提前抽取只有一个真实用例的展示结构。
- [x] AdminShell 拆为服务端壳与客户端导航叶节点；所有 `page.tsx` 和 `layout.tsx` 保持 Server Component。
- [x] 添加知识来源迁移为 Sheet、Tabs、Field、Input、Textarea、Alert、Button 和 Spinner 组合，现有 Server Action、轮询与刷新行为不变。
- [x] 登录成功与失败反馈、概览和知识来源状态、空状态及共享按钮迁移到对应基础或产品组件。
- [x] 移除被替代的手写浮层、重复 Button/字段/Badge/Alert class 和无用导入，不混入 MVP 03 或 06 的新功能。
- [x] 现有 MVP 01/02 Playwright 路径继续通过，定位优先使用 role、name、label 和 `aria-current`，不得降低业务断言强度。
- [x] Playwright 覆盖键盘打开 Sheet、Tab 焦点限制、Escape 关闭、焦点返回，以及 360px 移动导航和至少 40×40px 的主要交互目标。
- [x] 人工对照 1440px 与 360px 截图，确认布局无结构性漂移，视觉符合 `.superdesign/design-system.md`。
- [x] typecheck、lint、service tests、database tests、E2E 与 build 全部通过。

## Notes

- 完整决策、边界、迁移顺序和验收说明见 [规格](../spec.md)。
- 原语基座决策见 [ADR-0004](../../../docs/adr/0004-use-radix-as-shadcn-primitive-base.md)。
- 本工单完成后再继续 GroundedDesk MVP 03 及后续页面。

## Answer

已建立由 GroundedDesk 设计令牌控制视觉的 shadcn/Radix 基础组件层，并迁移登录、后台导航、概览和知识来源页面。添加知识来源及移动导航均改用 Radix Sheet；Playwright 增加键盘焦点、Escape、焦点返回、360px 表单与 40×40px 交互目标回归。基线与最终截图保存在 `../artifacts/`。
