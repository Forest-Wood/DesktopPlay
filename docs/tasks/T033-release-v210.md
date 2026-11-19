# T033 · 发布 DesktopPet v2.1.0

- 日期：2026-11-19（Asia/Shanghai）。
- 需求：[R040](../REQUIREMENTS.md#r040发布-desktoppet-v210t033)。
- 负责人：Antigravity。
- 分支：`release/T033-v210`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`5b6f13a`（远程 `origin/main`，已合入 PR #36 T031 与 PR #37 T032）。
- 基准正式版：`v2.0.2`（GitHub latest Release，提交 `b36bbc6`）。
- 目标版本：`v2.1.0`（变更类型：`minor`，含 T032 新增 NSIS + Portable 增量／差分更新功能，以及 T031 测试精简与协作规范）。
- 状态：发布准备中（待 CI 通过、合入 `main`、推送 `v2.1.0` 标签并完成 Release 工作流验证）。

## 发布内容与整理

- 同步版本至 `2.1.0`：`package.json`、`package-lock.json` 根包与 `src/shared/defaults.ts`（`APP_VERSION`），生成 `release-plan.json` 与中文更新公告 [docs/releases/v2.1.0.md](../releases/v2.1.0.md)。
- 顺带清理 PR #37 网页合并后在 `AGENTS.md`、`docs/REQUIREMENTS.md` 与 `docs/PROJECT_STATE.md` 中残留的重复行与顺序。
- 按 `T(N-2)` 滚动清理规则删除 `T031` 非跟踪临时测试产物（`.tmp/T031-PR.md`、`.tmp/T031-smoke-results`），保留 `T032` 与 `T033` 临时产物及所有跟踪文件。

## 验证命令与结果

| 检查命令 | 适用状态 | 结果与说明 |
| --- | --- | --- |
| `npm.cmd run release:prepare -- --base 2.0.2 --types minor --notes .tmp/T033-notes.md` | `release/T033-v210` | 通过（`Verified v2.1.0: minor from 2.0.2; announcement docs\releases\v2.1.0.md`） |
| `npm.cmd run release:check` | `release/T033-v210` | 通过 |
| `npm.cmd run build` | `release/T033-v210` | 通过（`tsc --noEmit`、Vite、esbuild） |
| `npm.cmd test -- --reporter=dot` | `release/T033-v210` | 通过（28 文件、322 项全量通过） |
| `git diff --check` | `release/T033-v210` | 通过 |

## 下一步

- 运行构建、全量单测与差异检查，推送 `release/T033-v210` 并创建 PR；
- 等待 CI 全绿后合入 `main`，创建并推送 `v2.1.0` 标签触发 `.github/workflows/release.yml`；
- 核对 GitHub Release `v2.1.0` 正式转正、正文公告及全部 6 项更新资产与摘要，并补齐发布后交接记录。
