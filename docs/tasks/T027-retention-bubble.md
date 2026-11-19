# T027 · 修复非首页气泡切换角色时挽留文案拼接问题

- 日期：2026-11-19（Asia/Shanghai）。
- 需求：[R034](../REQUIREMENTS.md#r034修复非首页气泡切换角色时挽留文案拼接问题t027)。
- 负责人：Antigravity。
- 分支：`fix/T027-retention-bubble`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`8c8c69e7c32ac99dbbe6f557c885bd34f1998c02`（已通过 [PR #29](https://github.com/Forest-Wood/DesktopPlay/pull/29) 合入远程 `main` `c101c7ec0759956d8cd66fe8e64a6d82aa5921a3`）。
- 结果提交：未提交（当前修改均位于工作区）。
- 已有未提交修改：开始任务前工作区干净；当前未提交修改全部归属 T027。
- 状态：已实现并通过构建与隔离 Electron 冒烟测试验证，待用户审阅。

## 目标与范围

修复桌宠气泡在“用量小报告”（`page === 1`）、“陪伴短句”（`page >= 2`）或通知气泡状态下点击“换角色”按钮时，挽留提示词被拼接在原页面文案下方的问题。

修改范围：`src/renderer/pet.ts`、`tests/smoke/desktop.spec.ts` 及需求／任务／项目状态文档。不涉及 IPC、持久化配置或版本号变更。

## 根因与实现要点

- **根因**：`src/renderer/pet.ts` 的 `render()` 在计算 `fixed` 固定正文时仅判断了 `notice ? ... : page === 1 ? summaryText(state) : page >= 2 ? phrases()[page - 2] ?? '' : ''`，未先排除 `retention === true` 的换角色挽留状态。因此当用户在第 2 页（用量小报告）或第 3+ 页（陪伴短句）点击“换角色”时，`fixed` 仍保留当前页报告或短句，随后 `[fixed, config.message].filter(Boolean).join('\n')` 将挽留提示词拼接在了原文字后面。
- **修复**：
  1. 在计算 `fixed` 时优先判断 `retention ? '' : ...`，使挽留状态下单独自成一页，仅展示 `config.message`（挽留提示词）。
  2. 在 `persistent()` 中增加 `!retention` 判断，避免在常驻通知期间点击“换角色”进入挽留态后，点击气泡正文误触发常驻通知关闭。
  3. 点击 `.bubble-switch` 进入挽留态时将 `.bubble-content` 的 `scrollTop` 重置为 `0`；点击“再陪一会儿”（`.bubble-cancel`）时退出 `retention` 并恢复原 `page` 内容。

## 验证命令与结果

| 检查命令 | 适用状态 | 结果与说明 |
| --- | --- | --- |
| `npm.cmd run build` | 工作区（`fix/T027-retention-bubble`） | 通过，含 `tsc --noEmit`、Vite 渲染层构建与 esbuild 构建 |
| `npx.cmd playwright test tests/smoke/desktop.spec.ts -g "comic bubble pages" --output=.tmp/T026-retention-smoke` | 工作区（隔离 profile） | 通过（1/1，2.2s），核验在“用量小报告”与“陪伴短句”分页点击“换角色”时仅展示独立挽留提示词，点击“再陪一会儿”后恢复原分页内容 |
| `git diff --check` | 工作区 | 通过 |

## 下一步

- 请用户验证并确认修复效果；按后续授权决定是否提交、推送或创建 PR。
