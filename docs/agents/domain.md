# 领域文档

本文说明工程技能在探索代码库时应如何使用本仓库的领域文档。

## 探索前需要阅读

- 仓库根目录下的 **`CONTEXT.md`**；或者
- 如果仓库根目录存在 **`CONTEXT-MAP.md`**，则按照其中的指引找到每个上下文对应的 `CONTEXT.md`，并阅读与当前主题相关的文件。
- **`docs/adr/`**——阅读与即将处理的区域有关的 ADR。在多上下文仓库中，还应检查 `src/<context>/docs/adr/` 中限定于特定上下文的决策。

如果其中任何文件不存在，**直接继续，不要提示**。不要报告文件缺失，也不要预先建议创建。`/domain-modeling` 技能（可通过 `/grill-with-docs` 和 `/improve-codebase-architecture` 使用）会在术语或决策真正得到确认时按需创建这些文件。

## 文件结构

单上下文仓库（适用于大多数仓库）：

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（根目录存在 `CONTEXT-MAP.md`）：

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 上下文特定决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用术语表中的词汇

当输出内容需要为领域概念命名时（例如问题标题、重构建议、假设或测试名称），请使用 `CONTEXT.md` 中定义的术语。不要改用术语表明确避免的同义词。

如果所需概念尚未出现在术语表中，这本身就是一个信号：要么正在创造项目并未使用的语言（应重新考虑），要么确实存在需要补充的空白（应记录下来供 `/domain-modeling` 处理）。

## 标明与 ADR 的冲突

如果输出内容与现有 ADR 冲突，请明确指出，不要静默覆盖：

> _与 ADR-0007（事件溯源订单）冲突——但值得重新讨论，因为……_
