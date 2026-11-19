# T030 · 发布 DesktopPet v2.0.2

- 日期：2026-11-19（Asia/Shanghai）。
- 需求：[R037](../REQUIREMENTS.md#r037发布-desktoppet-v202t030)。
- 负责人：Antigravity。
- 分支：`release/T030-v202`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`d7c32c2`（合并 [PR #33](https://github.com/Forest-Wood/DesktopPlay/pull/33) 后的远程 `origin/main`）。
- 结果提交：发布准备提交 `71a5a34`，已通过 [PR #34](https://github.com/Forest-Wood/DesktopPlay/pull/34) 合入 `main`（合并提交 `b36bbc675043a9579679904e035469c16d8f03f6`），标签 `v2.0.2` 指向该提交。
- 已有未提交修改：开始任务前工作区干净；当前修改全部归属 T030 发布与核验。
- 状态：已发布 `v2.0.2` 并完成远程 latest Release 与五项附件核验。

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

- [PR #34](https://github.com/Forest-Wood/DesktopPlay/pull/34) 通过 [CI 44530892972](https://github.com/Forest-Wood/DesktopPlay/actions/runs/44530892972) 并合并为 `b36bbc6`，标签 `v2.0.2` 指向该提交。
- [发布工作流 44531740265](https://github.com/Forest-Wood/DesktopPlay/actions/runs/44531740265) 历时 2 分 27 秒完成单测、Windows x64 打包、更新运行时校验、草稿上传及五项附件摘要与公告核对，[v2.0.2](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v2.0.2) 于 2026-11-19 21:18:18（Asia/Shanghai）成为最新正式版（`draft: false`, `prerelease: false`）：
  - `DesktopPet-2.0.2-Setup-x64.exe`（`120,451,469` B，`sha256:fbc4bf7475ad1fbe30fe240cdebb64f1cc8715094ddde80c66a537ce36dc5f31`）
  - `DesktopPet-2.0.2-Portable-x64.exe`（`120,129,733` B，`sha256:04f502d3600d382fe7d8b72fa769e94e2ba84cc595736f5e3e2216b08e186f9b`）
  - `DesktopPet-2.0.2-Setup-x64.exe.blockmap`（`126,951` B，`sha256:7cf7d1cf890269bdf26b679ca01d2b22d38e6fb1015834db77aa57b603b0d71f`）
  - `latest.yml`（`938` B，`sha256:0bc91d80cab31f1e9179811f2a17e9ed3ef2fbfba67bc41e5353debbe0144243`）
  - `SHA256SUMS.txt`（`197` B，`sha256:1b80f2752415abcf5028e84e609734ddac1a9e1a6aa881ae97d52035598a4572`）
- 本轮未在真实用户环境执行安装或升级；后续实机验收仍包括真实 VS Code／桌面 App 端 Gemini 完成气泡、真实网络更新下载 ETA 与共享额度账号。

