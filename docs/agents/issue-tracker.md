# 问题跟踪器：本地 Markdown

本仓库的问题和规格说明（也可称为 PRD）以 Markdown 文件的形式保存在 `.scratch/` 中。

## 约定

- 每个功能使用一个目录：`.scratch/<feature-slug>/`
- 规格说明位于 `.scratch/<feature-slug>/spec.md`
- 实现问题按工单拆分为独立文件，路径为 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号——不要将所有工单合并到一个文件中
- Triage 状态记录在每个问题文件顶部附近的 `Status:` 行中（角色字符串见 `triage-labels.md`）
- 评论和对话历史追加到文件底部的 `## Comments` 标题下

## 当技能要求“发布到问题跟踪器”时

在 `.scratch/<feature-slug>/` 下创建新文件；如果目录不存在，则一并创建。

## 当技能要求“获取相关工单”时

读取所引用路径下的文件。用户通常会直接提供文件路径或问题编号。

## 寻路操作

供 `/wayfinder` 使用。**地图**文件对应每个工单的一个**子工单**文件。

- **地图**：`.scratch/<effort>/map.md`——包含 Notes、Decisions-so-far 和 Fog 正文。
- **子工单**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 开始编号，正文中包含问题。`Type:` 行记录工单类型（`research`/`prototype`/`grilling`/`task`）；`Status:` 行记录 `claimed`/`resolved`。
- **阻塞关系**：文件顶部附近的 `Blocked by: NN, NN` 行。当列出的所有文件均为 `resolved` 时，该工单不再受阻塞。
- **前沿工单**：扫描 `.scratch/<effort>/issues/` 中处于开放、未阻塞且未认领状态的文件；编号最小者优先。
- **认领**：开始任何工作前，将 `Status:` 设为 `claimed` 并保存。
- **解决**：在 `## Answer` 标题下追加答案，将 `Status:` 设为 `resolved`，然后在 `map.md` 的 Decisions-so-far 中追加上下文指针（要点和链接）。
