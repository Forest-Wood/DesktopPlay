# T037 · 提醒中心（来源矩阵与接入向导）

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R041](../REQUIREMENTS.md#r041设置窗口与桌宠气泡前端重设计t034t041)。
- 负责人：待定（开工前确认）。
- 分支：`feat/T037-reminder-center`（建议）；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：待 T036 合入后核实最新 `origin/main`。
- 结果提交：未提交。
- 已有未提交修改：开工前核实工作区状态。
- 状态：**待开发**。

## 依赖

- 依赖 [T036](T036-home-overview.md) 已完成并合入（复用 `reminder-health.ts`）。

## 目标与范围

将原 `completion` 与 `reminders` 子页重构为**提醒中心**，用统一来源矩阵展示 4 个对话来源的完成／等待开关、接入方式、实时健康状态与音效入口，并将复杂目录与 Hook 配置收进可展开的接入向导步骤条。详细规格见 [UI_REDESIGN.md](../UI_REDESIGN.md#54-提醒中心completionreminders)。

### 计划改动清单

- 新增 `src/renderer/settings/views/reminders.ts`：
  - 4 行来源矩阵（Gemini · Antigravity／Codex／ChatGPT App／DeepSeek Harness），列为完成开关、等待回应开关、接入方式、实时状态（健康色点＋文字）、完成音效（“试听”与“编辑 ↗”直达人设工作室对应场景）。
  - 点击行展开**接入向导**步骤条：可从状态推导的步骤自动标注“已完成／待完成”，无法推导的步骤仅展示说明，不虚构状态；内嵌原有目录选择、Hook 接入开关与信任说明。
  - 页底**余额提醒**卡片，保留 `low-balance` 与 `daily-budget`。
- 新增向导步骤推导纯函数及对应单元测试。
- 支持从首页提醒健康条点击直达并自动展开指定来源行。

## 兼容边界

- 保留原有控件 id：`completion-enabled`、`completion-directory`、`dsh-directory`、`codex-attention-status`、`low-balance`、`daily-budget` 等，保障既有 smoke 稳定。
- 所有提醒开关与目录／Hook 配置仍遵循草稿保存模型，不擅自改写用户外部客户端配置。

## 验收条件

1. 向导步骤推导单测通过。
2. 现有 `completion`、`attention` 相关 smoke 用例通过，且新增矩阵开关保存与行展开验证通过。
3. “编辑 ↗”可准确跳转至人设工作室对应人设与场景。
4. `npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run build` 及 `1060×800` / `760×560` 截图核对通过。
5. 完成时清理 `T035` 的非跟踪临时测试产物（按 `T(N-2)` 规则）。

## 验证

| 检查 | 适用 | 结果 |
| --- | --- | --- |
| `npm.cmd run typecheck` | — | 未运行 |
| `npm.cmd test`（含向导步骤推导单测） | — | 未运行 |
| `npm.cmd run build` | — | 未运行 |
| `completion` / `attention` 相关 smoke 与截图核对 | — | 未运行 |

## 下一步

1. T036 合入后切出 `feat/T037-reminder-center`。
2. 抽取步骤推导逻辑并补齐单测，再完成矩阵与向导 UI 迁移。
