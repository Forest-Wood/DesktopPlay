# T033 · 发布 DesktopPet v2.1.0

- 日期：2026-11-19（Asia/Shanghai）。
- 需求：[R040](../REQUIREMENTS.md#r040发布-desktoppet-v210t033)。
- 负责人：Antigravity。
- 分支：`release/T033-v210`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`5b6f13a`（远程 `origin/main`，已合入 PR #36 T031 与 PR #37 T032）。
- 基准正式版：`v2.0.2`（GitHub latest Release，提交 `b36bbc6`）。
- 目标版本：`v2.1.0`（变更类型：`minor`，含 T032 新增 NSIS + Portable 增量／差分更新功能，以及 T031 测试精简与协作规范）。
- 发布提交与标签：`07f774b`（[PR #38](https://github.com/Forest-Wood/DesktopPlay/pull/38) 合入 `main`，标签 `v2.1.0` 指向 `07f774b`）。
- 正式发布：[v2.1.0](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v2.1.0)（2026-11-19 23:00:40 Asia/Shanghai，`draft: false`, `prerelease: false`, latest Release）。
- 发布工作流：[Release #44549546635](https://github.com/Forest-Wood/DesktopPlay/actions/runs/44549546635)（2m26s 全部通过）。
- 状态：已发布并完成公开 Release 核对（交接文档待合入 `main`）。

## 发布内容与整理

- 同步版本至 `2.1.0`：`package.json`、`package-lock.json` 根包与 `src/shared/defaults.ts`（`APP_VERSION`），生成 `release-plan.json` 与中文更新公告 [docs/releases/v2.1.0.md](../releases/v2.1.0.md)。
- 顺带清理 PR #37 网页合并后在 `AGENTS.md`、`docs/REQUIREMENTS.md` 与 `docs/PROJECT_STATE.md` 中残留的重复行与顺序。
- 按 `T(N-2)` 滚动清理规则删除 `T031` 非跟踪临时测试产物（`.tmp/T031-PR.md`、`.tmp/T031-smoke-results`），保留 `T032` 与 `T033` 临时产物及所有跟踪文件。

## 公开 Release 资产核对（6 项）

| 资源 | 状态 | 字节数 | GitHub SHA-256 Digest |
| --- | --- | --- | --- |
| `DesktopPet-2.1.0-Setup-x64.exe` | `uploaded` | `120,458,231` | `sha256:b219b4122768da056d611ad60221a28ab2cbf167232e08e0f32d8ec4491f7dd9` |
| `DesktopPet-2.1.0-Setup-x64.exe.blockmap` | `uploaded` | `127,141` | `sha256:e20d090e2fb3ef3e867170aa124e5c7ed354ac6602893e5ba45e04b83e794315` |
| `DesktopPet-2.1.0-Portable-x64.exe` | `uploaded` | `120,136,425` | `sha256:0fcd599948a952c026f5a713ce7ad8b757f3214823790ae67247acc42343c9a1` |
| `DesktopPet-2.1.0-Portable-x64.exe.blockmap` | `uploaded` | `126,873` | `sha256:0b8603c629702e1d66fd1a0a68d96ea1ec3f93e81a8c336ec205e35c5f4dff48` |
| `latest.yml` | `uploaded` | `1,096` | `sha256:5aedb0f1352048dff97767cf1f476a0f224c984e8f97eefae2f82da59af7a701` |
| `SHA256SUMS.txt` | `uploaded` | `197` | `sha256:1f6a088e1ab1944240e846275b1d9bc551cfb3d1bb40ca2488528928f4dd7493` |

Release 正文已核对与 `docs/releases/v2.1.0.md` 完全一致（`bodyMatchesNotes: true`）。

## 验证命令与结果

| 检查命令 | 适用状态 | 结果与说明 |
| --- | --- | --- |
| `npm.cmd run release:prepare -- --base 2.0.2 --types minor --notes .tmp/T033-notes.md` | `c482bf8` | 通过（`Verified v2.1.0: minor from 2.0.2; announcement docs\releases\v2.1.0.md`） |
| `npm.cmd run release:check` | `c482bf8` | 通过 |
| `npm.cmd run build` | `c482bf8` | 通过（`tsc --noEmit`、Vite、esbuild） |
| `npm.cmd test -- --reporter=dot` | `c482bf8` | 通过（28 文件、322 项全量通过） |
| PR #38 CI（`verify`） | `c482bf8` | 通过（2m4s） |
| Release 工作流 `44549546635` | 标签 `v2.1.0`（`07f774b`） | 通过（2m26s，单测、Windows x64 打包、6 项资产校验、更新运行时校验、草稿上传、摘要门禁与转正全部通过） |
| `gh api repos/Forest-Wood/DesktopPlay/releases/latest` | 公开 Release `v2.1.0` | 通过（`draft: false`、`prerelease: false`、6 项 `uploaded`、正文与公告一致） |
| `git diff --check` | 工作区 | 通过 |

## 下一步

- 合入本次发布后交接文档 PR，使 `main` 上 `docs/PROJECT_STATE.md` 与 `docs/tasks/T033-release-v210.md` 同步反映 `v2.1.0` 正式发布结果；后续从 `v2.1.0` 升级至下一正式版时可实机验收真实 GitHub Release 公开下载源的增量／差分升级体验。
