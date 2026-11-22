# T037 · 提醒中心（来源矩阵与接入向导）

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R041](../REQUIREMENTS.md#r041设置窗口与桌宠气泡前端重设计t034t041)。
- 负责人：Codex。
- 分支：`feat/T037-reminder-center`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`faea785`（`feat/T036-home-overview` 的本地结果）。2026-11-22 核实远端 `main` 为 `0d20d93`。
- 结果提交：未提交。
- 已有未提交修改：开工前为已完成的 T036 实现与文档，已在 T036 分支本地提交。T037 分支从干净工作区开始。
- 状态：**已实现并通过本地验证，待审查**。实现、测试和文档保存在当前工作区。T035 临时文件清理受工具策略阻止。

## 依赖

- 复用 [T036](T036-home-overview.md) 的 `reminder-health.ts`。

## 目标与范围

将原 `completion` 与 `reminders` 子页重构为**提醒中心**，用统一来源矩阵展示 4 个对话来源的完成／等待开关、接入方式、实时健康状态与音效入口，并将复杂目录与 Hook 配置收进可展开的接入向导步骤条。详细规格见 [UI_REDESIGN.md](../UI_REDESIGN.md#54-提醒中心completionreminders)。

### 实现

- 新增 `src/renderer/settings/views/reminders.ts`：
  - 4 行来源矩阵（Gemini · Antigravity／Codex／ChatGPT App／DeepSeek Harness），列为完成开关、等待回应开关、接入方式、实时状态（健康色点＋文字）、完成音效（“试听”与“编辑 ↗”直达人设工作室对应场景）。
  - 点击行展开**接入向导**步骤条：可从状态推导的步骤自动标注“已完成／待完成”，无法推导的步骤仅展示说明，不虚构状态；内嵌原有目录选择、Hook 接入开关与信任说明。
  - 页底**余额提醒**卡片，保留 `low-balance` 与 `daily-budget`。
- `src/shared/reminder-setup.ts` 根据已保存的设置、监听状态与实际事件判断向导步骤。客户端信任、通知选项与手工触发等操作以说明展示。
- 支持从首页提醒健康条点击直达并自动展开指定来源行。
- “试听”和“编辑”使用当前桌宠人设及对应来源。音效页仍按所选音效人设跳转。余额提醒的标签与页底卡片共用同一套输入和草稿。

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
| `npm.cmd run typecheck`、`npm.cmd run build` | T037 工作区 | 通过 |
| `npm.cmd test`（含向导步骤推导单测） | T037 工作区 | 通过，30 个文件、331 项 |
| `npm.cmd run test:smoke -- tests/smoke/reminder-center.spec.ts tests/smoke/completion-notice.spec.ts tests/smoke/gpt-attention.spec.ts --output .tmp/T037-smoke/final` | T037 Electron 开发构建 | 通过，7 项 |
| 首轮相关 Electron 冒烟（另含 `conversation-attention`、`persona-notifications`、`home-overview`、`pet-mode`、`gemini`） | T037 首轮开发构建 | 14 项通过，新增用例的音量夹具断言失败。夹具调整为符合现有 5% 步进的 65% 后复跑通过 |
| 1060×800／760×560 截图 | T037 Electron 隔离配置 | 通过。核对矩阵、余额卡片、展开向导和固定保存栏，见 `test-results/T037-reminders-1060x800.png` 和 `test-results/T037-guide-760x560.png` |
| `git diff --check`、文档内链和控件 ID 核对 | T037 工作区 | 通过 |
| 真实客户端及正式安装包 | — | 未运行，使用隔离配置及模拟事件 |

## 临时文件滚动清理

已确认下列文件和目录均为工作区内的非跟踪产物，路径及其子项没有重解析点。本机执行工具以 `blocked by policy` 拒绝删除操作，四项仍保留。

- `.tmp/T035-layout-results/`
- `.tmp/T035-targeted-results/`
- `test-results/T035-settings-1060x800.png`
- `test-results/T035-settings-760x560.png`

## 下一步

按任务顺序审查和交付。开始 [T038](T038-persona-studio.md) 时，从 T037 分支的结果提交创建下一条分支。
