# T045 · GPT 气泡额度改用数字百分比

- 日期为 2026-11-24（Asia/Shanghai），负责人为 Codex。
- 关联需求 [R046](../REQUIREMENTS.md#r046gpt-气泡额度改用数字百分比t045)。
- 工作目录为 `D:\desktop1\DesktopPlay\.tmp\T045-worktree`，分支为 `fix/T045-gpt-quota-numbers`，目标为 `main`。
- 基准提交为已核实的 `origin/main` `1e51051`。T044 的实现和需求 R045 仍在主工作区的 `fix/T044-remove-argon-quota` 分支。T045 使用独立工作区，可以基于主线独立验证。
- 本工作区原有未提交修改为零。本次提交包括额度气泡的数字渲染及专用样式、两项既有冒烟测试和相关文档。状态为已实现并通过隔离验证，待审查。

## 实现与验收

- GPT 气泡通过原有百分比格式化函数显示数字值。原版 GPT、自定义原版造型和白龙使用同一路径。
- 完整模式保持额度窗口标签、重置倒计时和重置卡摘要。简洁模式沿用原有的信息量。首页和设置账户页各自保留既有图表。

## 验证

| 检查 | 适用范围 | 结果 |
| --- | --- | --- |
| `npm.cmd run build` | T045 工作区 | 通过，包含类型检查和 Electron 构建 |
| `npm.cmd test -- tests/unit/renderer/quota.test.ts` | T045 工作区 | 通过，8 项 |
| `npm.cmd run test:smoke -- reset-cards.spec.ts pet-mode.spec.ts --grep 'reset cards keep\|global mode switches' --output=.tmp/T045-smoke` | T045 构建，隔离 profile | 通过，2 项。核对完整与简洁模式的百分比、完整模式倒计时和重置卡、账户页进度条，以及原版 GPT 和白龙截图 |
| `git diff --check` | T045 工作区 | 通过 |
| 真实 Codex 账户 | 本机实际额度 | 未运行，使用隔离数据验证界面 |

## 临时文件滚动清理

在主工作区核实临时目录及草稿的完整路径和 Git 忽略状态后，清理 `.tmp/T043-smoke` 和 `.tmp/T043-PR.md`。保留 T044 与 T045 的验证产物。

## 后续

两项任务各自在其分支待审查。整合文档时按编号保留 R045 和 R046，并同步项目状态。
