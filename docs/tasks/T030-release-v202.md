# T030 · 发布 DesktopPet v2.0.2

- 日期：2026-11-19（Asia/Shanghai）。
- 需求：[R037](../REQUIREMENTS.md#r037发布-desktoppet-v202t030)。
- 负责人：Antigravity。
- 分支：`release/T030-v202`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`d7c32c2`（合并 [PR #33](https://github.com/Forest-Wood/DesktopPlay/pull/33) 后的远程 `origin/main`）。
- 结果提交：待发布准备提交与合并后回填。
- 已有未提交修改：开始任务前工作区干净；本任务仅包含 v2.0.2 发布准备、CI 竞态测试修复与文档更新。
- 状态：进行中（发布准备验证通过，待提交 PR、通过 CI 并合并触发 `v2.0.2` 发布）。

## 目标与范围

按用户明确授权，以 GitHub 最新正式版 `v2.0.1`（`9679547`）为基准，将已合入主线的 [T029](T029-update-eta-gemini-completion.md)（`patch`：更新下载预计剩余时间、Gemini 任务完成气泡修复及临时测试文件滚动清理规范）发布为 `v2.0.2`。

- 通过 `npm.cmd run release:prepare -- --base 2.0.1 --types patch --notes .tmp/T030-notes.md` 同步 `package.json`、`package-lock.json`、`src/shared/defaults.ts`（`APP_VERSION = '2.0.2'`）、`release-plan.json` 与 `docs/releases/v2.0.2.md`。
- 修复 PR #33 远端 CI（[Run 44529486549](https://github.com/Forest-Wood/DesktopPlay/actions/runs/44529486549)）暴露的 `tests/unit/services/gemini.test.ts` 轮询竞态：原测试在两次 `powershell.exe` 转发脚本之间提前将 `conv-cancel` 写入 `CASCADE_RUN_STATUS_IDLE`，在较慢的 Windows CI 机器上恰好落入 2 秒轮询窗口；改为先写入 `CASCADE_RUN_STATUS_RUNNING`、完成两次同步 `Stop` 转发后再转为 `IDLE`，与真实 Antigravity 执行顺序一致。
- 按 `T(N-2)` 临时测试文件滚动清理规则，清理 `T028` 遗留的未跟踪临时文件（`.tmp/T028-PR.md`、`.tmp/T028-notes.md`、`.tmp/T028-handoff-pr.md`），保留 T029 与 T030 产物。

## 验证命令与结果

| 检查命令 | 适用状态 | 结果与说明 |
| --- | --- | --- |
| `npm.cmd run release:check` | 工作区（`release/T030-v202`） | 通过（`Verified v2.0.2: patch from 2.0.1; announcement docs\releases\v2.0.2.md`） |
| `npm.cmd run build` | 工作区 | 通过，含 `tsc --noEmit`、Vite 渲染层构建与 esbuild 构建 |
| `npm.cmd test -- --reporter=dot` | 工作区 | 通过（29 文件、329 项全量通过，含修复后的 `gemini.test.ts` 与三项 release 单测） |
| `git diff --check` | 工作区 | 通过 |

## 正式发布与核验

- 待合入 `main`、推送 `v2.0.2` 标签并核验 Release 工作流及五项公开附件。
