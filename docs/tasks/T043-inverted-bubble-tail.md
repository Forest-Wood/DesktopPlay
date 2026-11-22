# T043 · 修复倒置时气泡尖角未同步倒置

- 日期：2026-11-23（Asia/Shanghai）。
- 需求：[R044](../REQUIREMENTS.md#r044修复倒置时气泡尖角未同步倒置t043)。
- 负责人：Antigravity。
- 分支：`fix/T043-inverted-bubble-tail`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`37e2aad`（`origin/main`，已合入 PR #41 v2.2.0）。
- 结果提交：未提交。
- 已有未提交修改：无（从干净 `origin/main` 切出）。
- 本次未提交修改：`src/renderer/styles.css`、`tests/smoke/desktop.spec.ts`、`docs/REQUIREMENTS.md`、`docs/PROJECT_STATE.md`、本任务记录。
- 状态：**已实现并通过本地验证，待审查**。

## 问题与根因

当桌宠处于屏幕左上角（同时启用 `.flipped` 水平镜像与 `.bubble-below` 倒置下方气泡）时，气泡尖角（`.pet-bubble::before` / `::after`）虽然移到了气泡顶部，但三角形本身仍朝下，未随气泡一起上下倒置。

根因：`src/renderer/styles.css` 第 4 行遗留了一条旧样式规则 `.pet-canvas.flipped .pet-bubble:before, .pet-canvas.flipped .pet-bubble:after { right: auto; left: 42px; transform: scaleX(-1) rotate(8deg); }`，其选择器优先级 `(0, 3, 1)` 高于第 21 行基于 CSS 变量的统一规则 `.pet-canvas .pet-bubble:before, .pet-canvas .pet-bubble:after` `(0, 2, 1)`，导致 `.flipped` 开启时覆盖了 `--tail-x` 与 `scale(var(--tail-flip), var(--tail-y))`，使 `--tail-y: -1` 失效。

## 实现

- `src/renderer/styles.css`：移除第 4 行遗留的 `.pet-canvas.flipped .pet-bubble:before, .pet-canvas.flipped .pet-bubble:after` 规则，使四个象限（左右镜像 × 气泡上下位置）统一由第 18–24 行的 `--tail-x`、`--tail-flip`、`--tail-y`、`--tail-rotate` 驱动。
- `tests/smoke/desktop.spec.ts`：在既有 `native layout follows the character anchor and keeps upside-down text upright` 冒烟测试中补充气泡尖角伪元素变换方向断言（倒置＋左侧镜像时 `a < 0` 且 `d < 0`，恢复正常上方时 `a > 0` 且 `d > 0`）。

## 兼容边界

- 仅移除被新变量规则取代的冲突 CSS，不修改共享类型、IPC、命中区域（`pet-layout.ts`）、持久化格式或软件版本（属 `patch` 修复）。

## 验证

| 检查 | 适用 | 结果 |
| --- | --- | --- |
| `npm.cmd run build`（含 `tsc --noEmit`） | T043 工作区 | 通过 |
| `npm.cmd run test:smoke -- desktop.spec.ts --grep "native layout" --output .tmp/T043-smoke` | T043 隔离 Electron | 1 项通过，验证倒置与正常态尖角方向 |
| 目视核对 `.tmp/T043-smoke/.../pet-inverted.png` | T043 隔离 Electron | 通过：倒置左侧时气泡尖角朝上指向倒挂角色，边框与底色对齐清晰 |
| `git diff --check` | T043 工作区 | 通过 |
| 全量 `npm.cmd test`／其余 smoke | — | 未运行：仅改动单条冲突 CSS 与对应冒烟断言 |

## 临时文件滚动清理

按 `T(N-2)` 规则，核实 `.tmp/T041-capture` 位于仓库内、无 Git 跟踪项且无重解析点后已删除；保留 `T042`（`.tmp/T042-*`）与 `T043`（`.tmp/T043-smoke`）最近两轮产物及所有跟踪文件（含 `docs/previews/T041/`）。

## 下一步

审阅无误后按用户授权提交、推送并创建 PR 至 `main`。

