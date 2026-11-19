# T028 · 发布 DesktopPet v2.0.1

- 日期：2026-11-19（Asia/Shanghai）。
- 需求：[R035](../REQUIREMENTS.md#r035发布-desktoppet-v201t028)。
- 负责人：Antigravity。
- 分支：`release/T028-v201`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`903dd9e83b2e290e1e00ed94a206f4f900387f2b`（合并 [PR #29](https://github.com/Forest-Wood/DesktopPlay/pull/29) 与 [PR #30](https://github.com/Forest-Wood/DesktopPlay/pull/30) 后的远程 `main`）。
- 结果提交：发布准备提交 `d0faff3`，[PR #31](https://github.com/Forest-Wood/DesktopPlay/pull/31) 目标 `main`。
- 已有未提交修改：开始任务前工作区干净；当前修改全部归属 T028 发布准备。
- 状态：已完成 `v2.0.1` 版本与公告准备并通过构建及校验，已创建 [PR #31](https://github.com/Forest-Wood/DesktopPlay/pull/31) 并推进主线合并与标签发布。

## 目标与范围

按用户明确授权，以 GitHub 最新正式版 `v2.0.0`（`163a87a`）为基准，将已合入主线的 [T026](T026-gemini-ui.md)（`patch`）和 [T027](T027-retention-bubble.md)（`patch`）发布为 `v2.0.1`。

通过 `npm.cmd run release:prepare -- --base 2.0.0 --types patch --notes .tmp/T028-notes.md` 同步 `package.json`、`package-lock.json`、`src/shared/defaults.ts`（`APP_VERSION = '2.0.1'`）、`release-plan.json` 与 `docs/releases/v2.0.1.md`。

## 验证命令与结果

| 检查命令 | 适用状态 | 结果与说明 |
| --- | --- | --- |
| `npm.cmd run release:check` | 工作区（`release/T028-v201`） | 通过（`Verified v2.0.1: patch from 2.0.0; announcement docs\releases\v2.0.1.md`） |
| `npm.cmd run build` | 工作区 | 通过，含 TypeScript 类型检查、Vite 渲染层构建与 esbuild 构建 |
| `npx.cmd vitest run tests/unit/release-policy.test.ts tests/unit/release-assets.test.ts tests/unit/release-workflow.test.ts` | 工作区 | 通过 |
| `git diff --check` | 工作区 | 通过 |

## 下一步

- 提交并推送 `release/T028-v201`，创建并合入发布准备 PR，在主线合并提交上创建并推送 `v2.0.1` 标签以触发 GitHub Release 工作流，随后核验公开 Release 与五项附件。