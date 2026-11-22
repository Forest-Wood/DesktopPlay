# T039 · 桌宠气泡升级

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R041](../REQUIREMENTS.md#r041设置窗口与桌宠气泡前端重设计t034t041)。
- 负责人：Codex。
- 分支：`feat/T039-pet-bubble-refresh`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`05d6deb`（`feat/T038-persona-studio` 的本地结果），远端 `main` 核实为 `0d20d93`。
- 结果提交：未提交。
- 已有未提交修改：已将 T038 的实现、验证与交接文档保存在 T038 分支。T039 从干净工作区开始。
- 本次未提交修改：桌宠气泡渲染、样式、受影响测试与交接文档。
- 状态：**已实现并通过本地验证，待审查**。

## 依赖

- 复用 [T035](T035-ui-foundation.md) 的 `tokens.css` 变量体系。

## 目标与范围

在不改变 192 DIP 气泡高度、命中区域、倒挂镜像与优先级队列语义的前提下，全面升级桌宠气泡的信息层级、操作入口与提醒辨识度。详细规格见 [UI_REDESIGN.md](../UI_REDESIGN.md#6-桌宠气泡升级规格)。

### 实现

- 更新 `src/renderer/pet.ts`、`src/renderer/bubble-pages.ts` 及对应样式：
  - 页码由 `1/5` 改为页码点 `● ○ ○`（保留 `aria-label="第 X 页，共 Y 页"`；超过 7 页自动退回文本）。
  - 底部按钮收敛为 **↻ 刷新** 与 **⋯ 更多**；原顶部模式按钮移入“更多”菜单。
  - 点击“更多”时，二级菜单在气泡上方以**上层磨砂浮层遮盖展示**（不挤占气泡内部正文排版，保持在 192 DIP 气泡命中区内、DOM 实现且键盘可达），提供换角色（仍走挽留确认）、换造型、简洁／完整模式、打开设置。
  - GPT 用量页升级为两个迷你环形进度，百分比置于环内，倒计时保持单行完整显示（满足 R003）。
  - Gemini 用量页保留双列布局、同步主题变量，并**新增订阅方案标签**（如 `AI Pro`；无数据时不占位）。
  - DeepSeek 用量页峰谷信息改为胶囊样式。
  - 对话提醒气泡左上角显示来源标签（Codex／ChatGPT／DSH／Gemini）；等待回应使用琥珀色描边与外圈高亮，完成提醒沿用人设色。
  - 气泡配色改由 CSS 变量驱动，保留原有 `gpt-theme`／`dragon-theme`／`gemini-theme` 作为默认回退。
- 浮层可用键盘打开，Tab 在操作区内循环，Esc 返回入口。简洁模式下保留模式切换和设置入口，原有挽留和软件更新专用按钮继续有效。
- Gemini 方案徽标放在标题栏，为三项额度与重置时间保留正文宽高。默认对话提醒字号适配固定高度，较长自定义文案仍可滚动阅读。
- 补充页码点与 `aria-label` 单测及浮层、订阅方案、最长倒计时和角色镜像的 Electron 回归。

## 兼容边界

- 气泡尺寸（192 DIP 高）、`pet-layout.ts` 命中区域、倒挂／镜像规则、优先级队列、常驻／定时关闭与简洁模式过滤语义一律不变。
- `BubbleStyle` 颜色按字段生效，显式覆盖优先于等待提醒高亮、调色盘变量与人设默认色。基础样式为出厂值时允许主题注入 `--theme-pet-bubble-bg`、`--theme-pet-bubble-ink`、`--theme-pet-bubble-border`、`--theme-pet-bubble-ring`。这些变量只用于渲染，现有配置与 IPC 无需迁移。
- Gemini 使用现有 `GeminiQuotaState.planName`，额度来源未返回方案名时省略徽标。简洁模式继续只显示剩余额度。
- 不改动未解决的原生鼠标间歇偏移问题，也不得令其恶化。

## 验收条件

1. 页码点逻辑与 `aria-label` 单元测试通过。
2. 192 DIP 固定高度下，GPT（含最长倒计时与重置卡）、DeepSeek、Gemini（含订阅方案）、倒挂、镜像、简洁模式及“更多”上层遮盖浮层均无裁切或横向溢出。
3. `pet-mode`、`gemini`、`reset-cards`、`retention` 相关 smoke 通过。
4. `npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run build` 及关键状态截图核对通过。
5. 完成时清理 `T037` 的非跟踪临时测试产物（按 `T(N-2)` 规则）。

## 验证

| 检查 | 适用 | 结果 |
| --- | --- | --- |
| `npm.cmd run typecheck` | T039 工作区 | 通过 |
| `npm.cmd test` | T039 工作区 | 30 个文件、334 项通过，含页码点、无障碍标签和超过 7 页的回退 |
| `npm.cmd run build` | T039 工作区 | 通过 |
| `npm.cmd run test:smoke -- --grep 'comic bubble pages\|native layout\|global mode switches\|settings exposes\|Gemini skins\|reset cards\|completion bubbles persist\|version routing\|phrase controls\|bubble editor preserves\|studio keeps\|T023 reminder' --output .tmp/T039-smoke/verified` | Electron 开发构建、隔离配置 | 12 项通过。首轮 Gemini 徽标占用正文导致末行超出，移到标题栏后通过。GPT 以两种造型核对单／双窗口下的最长倒计时、未知与已到期状态及重置卡 |
| 目视核对截图 | `.tmp/T039-smoke/verified/` | 通过。覆盖 DeepSeek 峰谷胶囊、GPT 原版与白龙、Gemini 方案标签、简洁模式、等待与完成提醒、倒挂与浮层 |
| 真实账户和已知原生鼠标间歇偏移专项复测 | — | 未运行。隔离测试覆盖镜像后的菜单点击及等待队列与按下状态的交互 |

## 临时文件滚动清理

已确认路径在仓库内、无 Git 跟踪项和重解析点，删除 `.tmp/T037-smoke/`、`test-results/T037-reminders-1060x800.png` 和 `test-results/T037-guide-760x560.png`。T038、T039 验证产物和正式任务记录仍保留。

## 下一步

审查 T039 工作区。开展 [T040](T040-super-palette.md) 时从 T039 的结果提交创建独立分支，并接入渲染层预留的主题变量。
