# T039 · 桌宠气泡升级

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R041](../REQUIREMENTS.md#r041设置窗口与桌宠气泡前端重设计t034t041)。
- 负责人：待定（开工前确认）。
- 分支：`feat/T039-pet-bubble-refresh`（建议）；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：待核实 `feat/T038-persona-studio` 的结果提交。
- 结果提交：未提交。
- 已有未提交修改：开工前核实工作区状态。
- 状态：**待开发**。

## 依赖

- 复用 [T035](T035-ui-foundation.md) 的 `tokens.css` 变量体系。

## 目标与范围

在不改变 192 DIP 气泡高度、命中区域、倒挂镜像与优先级队列语义的前提下，全面升级桌宠气泡的信息层级、操作入口与提醒辨识度。详细规格见 [UI_REDESIGN.md](../UI_REDESIGN.md#6-桌宠气泡升级规格)。

### 计划改动清单

- 更新 `src/renderer/pet.ts`、`src/renderer/bubble-pages.ts` 及对应样式：
  - 页码由 `1/5` 改为页码点 `● ○ ○`（保留 `aria-label="第 X 页，共 Y 页"`；超过 7 页自动退回文本）。
  - 底部按钮收敛为 **↻ 刷新** 与 **⋯ 更多**；原顶部模式按钮移入“更多”菜单。
  - 点击“更多”时，二级菜单在气泡上方以**上层磨砂浮层遮盖展示**（不挤占气泡内部正文排版，保持在 192 DIP 气泡命中区内、DOM 实现且键盘可达），提供换角色（仍走挽留确认）、换造型、简洁／完整模式、打开设置。
  - GPT 用量页升级为两个迷你环形进度，百分比置于环内，倒计时保持单行完整显示（满足 R003）。
  - Gemini 用量页保留双列布局、同步主题变量，并**新增订阅方案标签**（如 `AI Pro`；无数据时不占位）。
  - DeepSeek 用量页峰谷信息改为胶囊样式。
  - 对话提醒气泡左上角显示来源标签（Codex／ChatGPT／DSH／Gemini）；等待回应使用琥珀色描边与外圈高亮，完成提醒沿用人设色。
  - 气泡配色改由 CSS 变量驱动，保留原有 `gpt-theme`／`dragon-theme`／`gemini-theme` 作为默认回退。
- 补充页码点与 `aria-label` 单元测试，以及气泡“更多”浮层、Gemini 订阅方案等隔离 smoke。

## 兼容边界

- 气泡尺寸（192 DIP 高）、`pet-layout.ts` 命中区域、倒挂／镜像规则、优先级队列、常驻／定时关闭与简洁模式过滤语义一律不变。
- `BubbleStyle` 用户显式覆盖优先于主题变量。
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
| `npm.cmd run typecheck` | — | 未运行 |
| `npm.cmd test` | — | 未运行 |
| `npm.cmd run build` | — | 未运行 |
| 气泡相关 smoke 与倒挂／镜像／简洁模式截图核对 | — | 未运行 |

## 下一步

1. 从 T038 分支的结果提交创建 `feat/T039-pet-bubble-refresh`。
2. 核实 Gemini 订阅方案字段在现有额度数据结构中的来源，若缺失则明确展示兜底规则后再动工。
