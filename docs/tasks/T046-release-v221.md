# T046 · 发布 DesktopPet v2.2.1

- 日期为 2026-11-24（Asia/Shanghai），负责人为 Codex。
- 工作目录为 `D:\desktop1\DesktopPlay`。分支为 `release/T046-v221`，目标为 `main`。
- 关联需求 [R047](../REQUIREMENTS.md#r047发布-desktoppet-v221t046)，基准提交为 `3a32aea`。开始时工作区干净。
- 以正式版 v2.2.0 为基准。T043–T045 均为已有功能修正，发布类型为 patch。发布公告见 [v2.2.1](../releases/v2.2.1.md)。
- 发布准备提交 `5f87207` 经 [PR #44](https://github.com/Forest-Wood/DesktopPlay/pull/44) 合入 `main`。标签 `v2.2.1` 指向该合并提交 `fbd7a8e`。

## 发布准备与验证

- `npm.cmd run release:prepare -- --base 2.2.0 --types patch --notes .tmp/T046-notes.md`、`npm.cmd run release:check`、`npm.cmd run build` 在 T046 工作区通过。
- [PR #43 原 CI](https://github.com/Forest-Wood/DesktopPlay/actions/runs/45338316781) 在 `507c075` 上有 22 项 Electron 用例通过、1 项失败。Codex 断言的页面级选择器同时匹配 Gemini 的方案标签，收窄到 Codex 额度容器后，`npm.cmd run test:smoke -- desktop.spec.ts --grep 'packaged renderer' --output=.tmp/T046-smoke` 在 v2.2.1 候选通过。
- 发布 PR 的完整 Windows CI 通过，覆盖单测、构建、两套文件系统助手验证及 23 项 Electron 冒烟。[发布 PR 的 CI](https://github.com/Forest-Wood/DesktopPlay/actions/runs/45339015809)
- 标签所指 `main` 提交的 Windows CI 通过。[主线 CI](https://github.com/Forest-Wood/DesktopPlay/actions/runs/45339396205)
- 真实账户或真实设备的安装和升级未执行。

## 发布结果

- GitHub 于 2026-11-24 14:19:47（Asia/Shanghai）将 v2.2.1 发布为最新正式版。[正式 Release](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v2.2.1)
- 发布工作流已验证 Windows x64 安装版、免安装版、两个 blockmap、`latest.yml` 和 `SHA256SUMS.txt` 的上传状态、大小及 SHA-256，并校验打包后的更新器依赖、更新源和公告。[发布工作流](https://github.com/Forest-Wood/DesktopPlay/actions/runs/45339414659)
- 从公开下载地址独立获取六项资源，文件大小和 SHA-256 均与 GitHub 一致。安装包 SHA-512 与 `latest.yml` 一致，两份 EXE 与 `SHA256SUMS.txt` 一致，免安装版 blockmap 可解析。仓库公告、GitHub Release 正文和 `latest.yml` 内的更新公告一致。本地副本在 `.tmp/T046-public`。

## 临时文件滚动清理

删除 T044 的独立测试目录 `.tmp/T044-smoke`、`.tmp/T044-smoke-final`，保留 T045 的工作区与共享证据 `.tmp/T044-T045-smoke`、T046 的本地验证产物和正式任务记录。
