# T046 · 发布 DesktopPet v2.2.1

- 日期为 2026-11-24（Asia/Shanghai），负责人为 Codex。
- 工作目录为 `D:\desktop1\DesktopPlay`。分支为 `release/T046-v221`，目标为 `main`。
- 关联需求 [R047](../REQUIREMENTS.md#r047发布-desktoppet-v221t046)，基准提交为 `3a32aea`。开始时工作区干净。
- 最新正式版是 v2.2.0。T043–T045 均为已有功能修正，发布类型为 patch。发布公告见 [v2.2.1](../releases/v2.2.1.md)。

## 发布准备与验证

- `npm.cmd run release:prepare -- --base 2.2.0 --types patch --notes .tmp/T046-notes.md`、`npm.cmd run release:check`、`npm.cmd run build` 在 T046 工作区通过。
- [PR #43 原 CI](https://github.com/Forest-Wood/DesktopPlay/actions/runs/45338316781) 在 `507c075` 上有 22 项 Electron 用例通过、1 项失败。Codex 断言的页面级选择器同时匹配 Gemini 的方案标签，收窄到 Codex 额度容器后，`npm.cmd run test:smoke -- desktop.spec.ts --grep 'packaged renderer' --output=.tmp/T046-smoke` 在 v2.2.1 候选通过。
- 发布 PR 的完整 Windows CI 覆盖单测、构建、两套文件系统助手验证及完整 Electron 冒烟。发布工作流负责打包、校验并上传六项资源。
- 真实账户或真实设备的安装和升级未执行。

## 临时文件滚动清理

删除 T044 的独立测试目录 `.tmp/T044-smoke`、`.tmp/T044-smoke-final`，保留 T045 的工作区与共享证据 `.tmp/T044-T045-smoke`、T046 的本地验证产物和正式任务记录。
