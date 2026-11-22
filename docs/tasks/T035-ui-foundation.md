# T035 · UI 基础层与 6 项导航骨架

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R041](../REQUIREMENTS.md#r041设置窗口与桌宠气泡前端重设计t034t041)。
- 负责人：待定（开工前确认）。
- 分支：`feat/T035-ui-foundation`（建议）；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：待开工前核实最新 `origin/main`（或本地基于 `docs/T034-ui-redesign-plan` 切出）。
- 结果提交：未提交。
- 已有未提交修改：开工前核实工作区状态。
- 状态：**待开发**。

## 依赖

- 依赖 [T034](T034-ui-redesign-plan.md) 规划文档定稿。

## 目标与范围

建立前端重设计的视觉 token、纯 DOM 通用组件和 6 项导航路由骨架，将现有设置子页按 [UI_REDESIGN.md](../UI_REDESIGN.md#41-新旧映射) 挂载到新分类下，并引入导航草稿圆点与底部“放弃修改”能力。本任务不重写各业务子页内部排版（留待 T036–T040 逐页迁移）。

### 计划改动清单

- 新增 `src/renderer/tokens.css`，收拢颜色、状态色、人设色等设计变量；`settings.css`、`settings-workspace.css`、`styles.css`、`quota.css` 改为引用变量。
- 新增 `src/renderer/ui/` 纯 DOM 工厂组件（`card`、`statusChip`、`ring`、`bar`、`sparkBars`、`switchRow`、`stepList`、`segmented`、`personaPicker`），仅输出带 class 的 DOM，不管理状态。
- 新增 `src/renderer/settings/router.ts`，实现 6 项导航（首页总览、伙伴、账户、提醒中心、人设工作室、系统）、统一 `navigate(category, page, focusTarget?)`、键盘焦点移动与 `tab`/`tabpanel` 语义。
- 在 `src/renderer/settings.ts` 接入导航草稿圆点与保存栏“N 项未保存 · 放弃修改 · 保存设置”。
- 集中调整 `tests/smoke/` 中的导航辅助函数以适配新 `tab-*` 归属。

## 兼容边界

- 保留所有既有 `section id`（`appearance`、`behavior`、`overview`、`codex`、`gemini`、`records`、`completion`、`reminders`、`companionship`、`bubbles`、`sound`、`version`、`guide`、`licenses`、`uninstall`）。
- 保留 `onSettingsPage('version')` 与托盘“检查更新”直达“系统 → 版本与更新”的行为。
- 不新增 IPC、不改变持久化设置格式、不修改软件版本。

## 验收条件

1. 所有原 `section id` 均可经新 6 项导航到达，无死链或焦点丢失。
2. 编辑任一草稿项后对应导航显示琥珀色圆点，点击“放弃修改”恢复到最近一次 `AppState.settings`；即时生效操作（切换角色／造型／账户操作等）不计入草稿。
3. `npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run build` 与 `npm.cmd run test:smoke` 通过。
4. 在 `1060×800` 与 `760×560` 两种窗口尺寸下截图核对，无横向溢出、正文单区滚动、底部保存栏固定可见。
5. 完成时清理 `T033` 的非跟踪临时测试产物（按 `T(N-2)` 规则）。

## 验证

| 检查 | 适用 | 结果 |
| --- | --- | --- |
| `npm.cmd run typecheck` | — | 未运行 |
| `npm.cmd test` | — | 未运行 |
| `npm.cmd run build` | — | 未运行 |
| `npm.cmd run test:smoke` | — | 未运行 |
| `1060×800` / `760×560` 视觉截图核对 | — | 未运行 |

## 下一步

1. 核实分支基线并切出 `feat/T035-ui-foundation`。
2. 先完成 `tokens.css` 与 `ui/` 组件，再迁移 `router.ts` 与草稿栏，最后统一更新 smoke 导航辅助函数并跑全量验证。
