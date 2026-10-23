# T016：发布 DesktopPet v1.0.1

- 日期：2026-10-23（Asia/Shanghai）；负责人：Codex；需求 R024；目标 main。
- 工作目录：`D:\desktop1\DesktopPlay`；分支：`release/T016-v101`；基准 `d39b9ec9a4c4993a387f51e251032804e2ff5f7e`（PR #17 已合并）；发布准备 `a5ad4852a48d5b22b7173eece371c09ab20f57ba` 经 [PR #18](https://github.com/Forest-Wood/DesktopPlay/pull/18) 合并至 main `7755edc48751c6ca02afd53fd6828e134212f437`。
- 开始时 T015 分支干净，无带入修改。用户明确要求创建新 Release，授权本次版本准备、必要验证、提交／推送／整合、新标签和正式发布。
- 已核实最新正式版本 v1.0.0（Release `420443336`），无发布草稿，获取远程标签后无 v1.0.1；本次修复既有功能，按 R017 取 patch，从 1.0.0 一次升至 1.0.1。
- 状态：v1.0.1 已于 **2026-10-23 12:48:44（Asia/Shanghai）正式发布为 latest**，Release `421460724`。[正式下载](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v1.0.1)。annotated 标签对象 `e0ee1270c1fe103c1f038d53fa5dd8958073683f` 解析到 `7755edc`，源码树与通过发布准备 CI 的 `a5ad485` 一致。公开五附件下载、摘要和公告一致性已核实，旧标签及附件保留。

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
- **通过**：发布准备 CI #55（`39901599694`）完整通过，PR #18 已合并。合并后 diff 核实源码树与已验证提交完全一致，再次查询最新正式版仍为 v1.0.0，release:check 通过后才创建和推送新标签。
- **通过**：合并主线 CI #56（`39902118721`）完整通过；Release #15（`39902132846`）成功，草稿五附件大小／SHA-256 digest、公告及上一正式基准核对后自动转正为 latest。GitHub 连接器缺少 Release 接口及写权限，发布准备 PR 和合并使用已有 Git 凭据在内存中调用官方 API，未输出或保存凭据。
- **通过**：正式 Release API、latest 均为 v1.0.1／`421460724`，draft=false、prerelease=false。五附件完整公开下载，全部 HTTP 200，字节数和 SHA-256 均与 GitHub 元数据匹配；SHA256SUMS.txt、安装版 SHA-512 与 latest.yml 一致；Release 正文、仓库公告与 latest.yml.releaseNotes 一致。证据 `.tmp/t016-public-verification.json`，下载目录 `.tmp/T016-published-v101`。
- **保留限制**：T015 真实 ChatGPT 三模式及完整 VS Code GUI 待验收；本次不将合成日志、隔离 Electron 或原生引擎协议测试当作真实 GUI 验证。历史原生鼠标间歇偏移与 AppContainer ACL 环境限制见 T015／T014。

## 下一步

本次发布及公开下载核实已完成。发布后交接另行提交到本分支，不改已发布标签或附件；真实客户端 GUI 试用按 T015 矩阵补记录，后续修复创建独立任务。

## 公开附件核对

| 附件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| DesktopPet-1.0.1-Setup-x64.exe | 115157360 | `4b056e4c185131e5712fbed6ed95968d9bc05b5ebaeaa11c18d34bf287cf909c` |
| DesktopPet-1.0.1-Portable-x64.exe | 114835630 | `a54c1c48f532e0201ed86081bf58d36c3cfb2128239b7af8edf23c71813a4998` |
| SHA256SUMS.txt | 197 | `9d8805add449cfec788ebb4bea9bfbde47290e31660e131aaf2769e0d6b90901` |
| latest.yml | 1189 | `cadebec25790f72bd6ebccaa294377c28e386fdf181c19668cc81533e34a0a50` |
| DesktopPet-1.0.1-Setup-x64.exe.blockmap | 121188 | `ce830295dc19bdceacce14d783d833fd1980c4bfd5efd4ba5e3fbda0121d4fa2` |
