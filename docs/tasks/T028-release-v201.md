# T028 · 发布 DesktopPet v2.0.1

- 日期：2026-11-19（Asia/Shanghai）。
- 需求：[R035](../REQUIREMENTS.md#r035发布-desktoppet-v201t028)。
- 负责人：Antigravity。
- 分支：`release/T028-v201`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`903dd9e83b2e290e1e00ed94a206f4f900387f2b`（合并 [PR #29](https://github.com/Forest-Wood/DesktopPlay/pull/29) 与 [PR #30](https://github.com/Forest-Wood/DesktopPlay/pull/30) 后的远程 `main`）。
- 结果提交：发布准备提交 `d0faff3`、交接提交 `3879bd7`，已通过 [PR #31](https://github.com/Forest-Wood/DesktopPlay/pull/31) 合入 `main`（合并提交 `96795479680d3906d3570cd5ef23953984d7482e`），标签 `v2.0.1` 指向该提交。
- 已有未提交修改：开始任务前工作区干净；当前修改全部归属 T028 发布与核验。
- 状态：已发布 `v2.0.1` 并完成远程 latest Release 与五项附件核验。

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

## 正式发布与核验

- [PR #31](https://github.com/Forest-Wood/DesktopPlay/pull/31) 合并为 `9679547`，标签 `v2.0.1` 指向该提交。
- [发布工作流 44507457122](https://github.com/Forest-Wood/DesktopPlay/actions/runs/44507457122) 历时 1 分 59 秒完成单测、Windows x64 打包、更新运行时校验、草稿上传及五项附件摘要与公告核对，[v2.0.1](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v2.0.1) 于 2026-11-19 18:39:51（Asia/Shanghai）成为最新正式版（`draft: false`, `prerelease: false`）：
  - `DesktopPet-2.0.1-Setup-x64.exe`（`120,446,486` B，`sha256:a521c6df4358024a3066a8d939c5b1f7e841862d16c6f2a0922c012390cbf50c`）
  - `DesktopPet-2.0.1-Portable-x64.exe`（`120,124,689` B，`sha256:c986327ac2c1b32804a1b8c03eeecf3b4eaffc0dd3fb18c3aec9ce3f547cec60`）
  - `DesktopPet-2.0.1-Setup-x64.exe.blockmap`（`127,085` B，`sha256:5c49dc506869c13dc778f168a816c8d80432e9fb0cf540ac2893266ffdb83914`）
  - `latest.yml`（`1,134` B，`sha256:c07bf9a392a0fa55b89ce1ae789de3cdc35bff7ca654678c141084f0fa6c50ec`）
  - `SHA256SUMS.txt`（`197` B，`sha256:fc5fc0e79d52e7915700eab40baa64392dd7e519b3379442501906fab90ecc14`）
- 本轮未在真实用户环境执行安装或升级；后续实机验收仍包括 Antigravity 三端通知和共享额度账号。