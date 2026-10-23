# T016：发布 DesktopPet v1.0.1

- 日期：2026-10-23（Asia/Shanghai）；负责人：Codex；需求 R024；目标 main。
- 工作目录：`D:\desktop1\DesktopPlay`；分支：`release/T016-v101`；基准 `d39b9ec9a4c4993a387f51e251032804e2ff5f7e`（PR #17 已合并）；发布准备提交：未提交。
- 开始时 T015 分支干净，无带入修改。用户明确要求创建新 Release，授权本次版本准备、必要验证、提交／推送／整合、新标签和正式发布。
- 已核实最新正式版本 v1.0.0（Release `420443336`），无发布草稿，获取远程标签后无 v1.0.1；本次修复既有功能，按 R017 取 patch，从 1.0.0 一次升至 1.0.1。
- 状态：发布准备中，未创建标签、未发布；不覆盖历史 Release 或附件。

## 范围与验收

发布 T015 的 GPT 系列等待回应提醒修复与接入诊断。同步 package、lock 根包、APP_VERSION、release-plan.json 与简短中文公告，保持 appId、数据目录及升级方式不变。

验证版本、类型／构建、全量单测／Electron 和两个 helper；核对本地安装版／免安装包及运行资源。发布准备整合到 main 后创建新标签，沿用 Release 工作流测试打包、上传草稿并核实五附件后转为正式 latest；完整下载五附件，核对大小、SHA-256／SHA-512 和公告一致性。只使用隔离数据，不做真实用户升级实验。

## 验证与进度

- **通过**：PR #17 已合并至 main `d39b9ec`，PR CI #53（`39900581952`）与主线 CI #54（`39900965259`）完整通过。
- **通过**：`npm.cmd ci`（锁文件安装成功）；`release:prepare --base 1.0.0 --types patch --notes .tmp/T016-update-notes.md` 和 `release:check --require-plan --latest-version v1.0.0 --tag v1.0.1`。
- **通过**：v1.0.1 工作区 `npm.cmd test` 25 文件／266 项；`npm.cmd run dist -- --config.directories.output=.tmp/T016-release-v101`，含类型检查、界面／主进程构建与安装／免安装打包。打包禁止自动发布。
- **通过**：完整 `npm.cmd run test:smoke` 20/20（1.3 分钟），使用提权隔离 profile，保留 Electron 沙箱；本轮原生鼠标场景通过，不代表历史间歇根因已解决。测试生成的四张旧版本预览图恢复为基准，避免无关图片差异。
- **通过**：卸载 helper 文件测试 3 场景；更新 helper 7 场景，包含来源进程等待超时。均只操作隔离 fixture。
- **通过**：`node scripts/verify-release.mjs .tmp/T016-release-v101`、`node scripts/verify-update-runtime.mjs .tmp/T016-release-v101/win-unpacked/resources`，核实五更新资源、公告、大小、SHA-512、运行依赖与固定发布源。asar 内 conversation-hook.ps1 与源码字节一致，包版本为 1.0.1。
- **通过**：`npm.cmd audit --omit=dev --json`，生产依赖报告 0 项；npm ci 的 2 项 high 为开发依赖范围，本任务未改依赖或锁定版本。
- **待执行**：发布准备 CI、main 整合、标签与 Release、公开下载核实。
- **保留限制**：T015 真实 ChatGPT 三模式及完整 VS Code GUI 待验收；本次不将合成日志、隔离 Electron 或原生引擎协议测试当作真实 GUI 验证。历史原生鼠标间歇偏移与 AppContainer ACL 环境限制见 T015／T014。

## 下一步

准备并验证 v1.0.1，记录失败、恢复与未运行项；公开下载核实通过后记录 Release、标签、提交及五附件摘要。
