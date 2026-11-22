# T036 · 设置窗口首页总览

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R041](../REQUIREMENTS.md#r041设置窗口与桌宠气泡前端重设计t034t041)。
- 负责人：Codex。
- 分支：`feat/T036-home-overview`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`ef88296`（`feat/T035-settings-foundation` 的本地结果）。2026-11-22 核实远端 `main` 为 `0d20d93`。
- 结果提交：未提交。
- 已有未提交修改：开始时为已完成的 T035 实现及分支规则文档，先在 T035 分支本地提交。T036 分支从干净工作区开始。
- 状态：**已实现并通过本地验证，待审查**。实现、测试和文档保存在当前工作区。

## 依赖

- 依赖 [T035](T035-ui-foundation.md) 的导航、共享组件和草稿栏。

## 目标与范围

实现设置窗口默认打开的**首页总览（`home`）**与提醒健康色纯函数推导，在一屏内汇总 3 个账户卡、4 个对话提醒来源的健康状况、当前伙伴卡及顶栏快捷操作。详细规格见 [UI_REDESIGN.md](../UI_REDESIGN.md#51-首页总览-home新增)。

### 实现

- 新增 `src/shared/reminder-health.ts`：纯函数推导 4 个提醒来源的 5 色健康状态（`off` / `err` / `warn` / `ok` / `info`），完全基于现有 `AppState`，不新增状态字段。
- 新增 `src/renderer/settings/views/home.ts`：
  - 问候条与汇总摘要（可点击跳转待处理来源），右侧快捷操作（刷新全部、简洁／完整模式切换、检查更新）。
  - 3 张账户卡网格（当前角色对应账户卡高亮）：DeepSeek（余额、今日已观测、最近 7 日迷你柱图、峰谷标签）、Codex（每周／5H 环形进度、套餐标签、重置卡摘要）、Gemini（3 条进度条、订阅方案标签、共享／缺失语义）；各卡含 5 种状态胶囊与空状态主按钮。
  - 4 来源对话提醒健康条（来源名、完成／等待开关态、健康色点＋文字、最近事件时间），点击跳转提醒中心并展开对应行。
  - 当前伙伴卡（当前角色舞台、昵称、模式与“换角色／换造型”快捷按钮）。
- “刷新全部”依次调用 `refreshBalance`、`refreshCodexQuota`、`refreshGeminiQuota`，任一失败不影响其余并复用既有票据保护。
- 补充 `tests/unit/` 健康色推导单测与 `tests/smoke/` 首页隔离冒烟测试。

Gemini 套餐是额度状态中的可选字段，复用既有额度响应与状态桥接。公开的 `/usage` 说明描述额度窗口，套餐标签取响应中明确的套餐元数据，缺省显示“套餐未提供”。[Antigravity CLI 额度文档](https://antigravity.google/docs/cli/commands/usage)

提醒健康和最近事件时间使用各来源已有状态。首页跳转会展开现有接入卡，T037 可沿用同一健康函数。

## 兼容边界

- 默认打开首页；不再把“初次打开定位到当前角色账户页”作为默认路由，改为首页高亮当前角色账户卡。
- 空状态仅提供入口或提示，不代用户启动外部客户端；不新增 IPC，不修改持久化格式。

## 验收条件

1. `reminder-health.ts` 5 种健康色优先级与边界单测通过。
2. 演示数据与 `DESKTOPPLAY_TEST_NO_CODEX=1` 隔离条件下，首页 3 张账户卡（含空状态按钮）、4 来源健康条、当前伙伴卡及“刷新全部”工作正常。
3. 窄窗口（`760×560`）下网格自动折行，无横向溢出。
4. `npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run build`、相关 smoke 及 `1060×800` / `760×560`（含空状态）截图核对通过。
5. 完成时清理 `T034` 的非跟踪临时测试产物（按 `T(N-2)` 规则）。

## 验证

| 检查 | 适用 | 结果 |
| --- | --- | --- |
| `npm.cmd run typecheck`（通过 build 执行） | T036 工作区 | 通过 |
| `npm.cmd test`（含 `reminder-health` 单测） | T036 工作区 | 通过，29 个文件、327 项 |
| `npm.cmd run build` | T036 工作区 | 通过 |
| `npm.cmd run test:smoke -- --grep 'home opens\|global mode switches\|settings exposes\|version routing\|Gemini skins\|packaged renderer\|bubble editor preserves\|reset cards' --output .tmp/T036-smoke/final` | 当前 Electron 开发构建 | 通过，8 项。覆盖首页、Gemini、模式、版本路由、设置持久化、气泡草稿和重置卡 |
| `node .tmp/T036-smoke/demo-preview.mjs` 与截图核对 | Edge 本地演示及 Electron 隔离配置 | 通过。检查 1060×800 与 760×560，截图保存在 `test-results/T036-home-*.png` |
| 文档内链与 `git diff --check` | T036 工作区 | 通过 |
| 真实账户与正式安装包 | — | 未运行。套餐元数据使用隔离额度响应验证 |

首轮类型检查发现测试环境对象类型和 DOM `hidden` 类型不匹配，修正后构建通过。演示检查首轮受 PowerShell 管道编码影响，改用转义字符串的本地脚本后通过。

## 临时文件滚动清理

已检查 `.tmp/` 和 `test-results/`，未发现 T034 的非跟踪临时产物。T034 正式原型继续保存在 `docs/previews/T034/`。

## 下一步

按任务顺序审查和交付。开始 [T037](T037-reminder-center.md) 时，从 T036 分支的结果提交创建下一条分支。
