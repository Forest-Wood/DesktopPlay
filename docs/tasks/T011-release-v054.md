# T011：发布 DesktopPet v0.5.4

- 日期：2026-10-22（Asia/Shanghai）；负责人：Codex；需求 R016；目标 main。
- 目录：`D:\desktop1\DesktopPlay`；分支：`release/T011-v054`；基准 `fcf3f30a02f3221668a7e0acbeeb390d1f84cf41`（PR #10 合并）；结果：未提交。
- 开始时 T010 工作区干净，无带入修改。用户明确要求发布新的 Release，授权本次版本准备、必要验证、提交／推送／整合、新标签和正式发布。
- 状态：准备中。远程 latest 为 v0.5.3（Release `418176374`），不存在 v0.5.4 标签或草稿；旧发布和标签保留。

## 范围与验收

将已合并的 DSH 提醒、三桌宠气泡档案和完成音效发布为下一个补丁版本 v0.5.4。同步 package、lock 根包与 APP_VERSION，更新发行说明；保持 appId、数据目录及现有升级方式。只提交本任务发布文件，不改功能实现、依赖或既有测试断言。

核对主线与发布准备 CI，创建匹配版本的新标签；使用现有 Release 工作流打包并上传两个 EXE、SHA256SUMS.txt、latest.yml、NSIS blockmap，逐一核实完整性后转为正式 latest。公开入口、大小与摘要需复核。不得用真实桌宠测试升级，不移动旧标签或覆盖旧公开附件。

## 验证与交付

- 已核实：[PR #10](https://github.com/Forest-Wood/DesktopPlay/pull/10) 合并到 `fcf3f30`，[PR CI #36](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39629868426) 与主线 [CI #37](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39631043773) 完整通过（含两个 helper 和 Electron）。
- 通过：本次 v0.5.4 工作区 `npm.cmd run build`（含类型检查）与 `npm.cmd test`（22 文件／223 单测，5.64 秒）。
- 待执行：发布准备 CI、标签工作流打包与资源校验、正式 Release 及公开下载核实。
- 保留限制：T010 本地完整 Electron 15/16，原生鼠标偏移用例原样重试通过，未解决根因；真实账户、DSH／Work 端到端及真实用户数据覆盖升级未运行。本次不修改更新器实现，不重复独立两版本升级实验。

下一步：完成验证与发布准备 PR，经 CI 后整合并创建 v0.5.4 标签；跟踪发布直至正式 latest 与五附件均核实完成。
