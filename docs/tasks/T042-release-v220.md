# T042 · 发布 DesktopPet v2.2.0

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R043](../REQUIREMENTS.md#r043发布-desktoppet-v220t042)。
- 负责人：Antigravity。
- 分支：`release/T042-v220`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`242a007`（远程 `origin/main`，已合入 PR #40 T034–T041）。
- 基准正式版：`v2.1.0`（GitHub latest Release，提交 `07f774b`）。
- 目标版本：`v2.2.0`（变更类型：`patch, minor`，含 T035–T039 设置窗口与桌宠气泡重设计完善、T038 伙伴可编辑昵称与 T040 超级调色盘新增功能）。
- 发布提交与标签：待合入 `main` 后打标 `v2.2.0`。
- 状态：**发布准备中（待 CI 通过后合入并触发 Release 工作流）**。

## 发布内容与整理

- 同步版本至 `2.2.0`：`package.json`、`package-lock.json` 根包与 `src/shared/defaults.ts`（`APP_VERSION`），生成 `release-plan.json` 与中文更新公告 [docs/releases/v2.2.0.md](../releases/v2.2.0.md)。
- 修复 `tests/smoke/theme-palette.spec.ts` 中 `bubble.screenshot()` 未禁用 CSS 动画导致 Windows CI 偶发像素比对抖动的问题（补充 `await expect(bubble).toBeVisible()` 与 `{ animations: 'disabled' }`）。
- 同步更新 `docs/REQUIREMENTS.md`（R041／R042 标为已合并，新增 R043）与 `docs/PROJECT_STATE.md`。

## 验证命令与结果

| 检查命令 | 适用状态 | 结果与说明 |
| --- | --- | --- |
| `npm.cmd run release:prepare -- --base 2.1.0 --types patch,minor --notes .tmp/T042-notes.md` | T042 工作区 | 通过（`Verified v2.2.0: patch, minor from 2.1.0; announcement docs\releases\v2.2.0.md`） |
| `npm.cmd run release:check` | T042 工作区 | 通过 |
| `npm.cmd run build` | T042 工作区 | 通过 |
| `npm.cmd test` | T042 工作区 | 通过（31 文件、340 项全量通过） |
| `npm.cmd run test:smoke -- theme-palette.spec.ts` | T042 工作区 | 通过 |
| PR CI（`verify`）与 Release 工作流 | — | 待推送后执行 |

## 临时文件滚动清理

按 `T(N-2)` 规则，验证完成后删除 `T040` 的非跟踪临时目录 `.tmp/T040-smoke`，保留 `T041`（`.tmp/T041-capture`）与 `T042`（`.tmp/T042-*`）最近两轮产物及所有跟踪文件。

## 下一步

1. 推送 `release/T042-v220` 并创建 PR 至 `main`，等待 CI `verify` 全量通过。
2. 合并 PR 至 `main`，在合并提交创建并推送标签 `v2.2.0` 触发 Release 工作流。
3. 核实公开 Release `v2.2.0` 的六项资产、摘要与公告一致性。

