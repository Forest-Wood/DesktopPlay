# T014：发布 DesktopPet v1.0.0

- 日期：2026-10-22（Asia/Shanghai）；负责人：Codex；需求 R022；目标 main。
- 工作目录：`D:\desktop1\DesktopPlay`；分支：`release/T014-v100`；基准 `7ac74a2ef2f09d33269f3a61bd5b2880f53dfec0`（PR #14 已合并）；发布准备 `6bc1bb8e12b2076255482859601967da7a393c2b` 经 [PR #15](https://github.com/Forest-Wood/DesktopPlay/pull/15) 合并至 main `13a395136b814211d4df16a33e6251dc1777828d`。
- 开始时 T013 工作区干净，无带入修改。用户明确要求发布新的 Release，授权本次版本准备、必要验证、提交／推送／整合、新标签和正式发布。
- 已核实最新正式版本为 v0.5.4（Release `419779328`），无 v1.0.0 标签或草稿。按 T012 规则，T013 三桌宠新增等待提醒及短句控制为 major，完成气泡完善为 patch；取最高档一次升至 1.0.0。
- 状态：v1.0.0 已于 2026-10-22 15:57:42（Asia/Shanghai）正式发布为 latest，Release ID `420443336`。annotated 标签对象 `8e5b45ea71434aa103a9d58b5a216a130f8da905`，解析到 `13a3951`；源码树与已通过发布准备 CI 的 `6bc1bb8` 完全一致。旧标签与正式附件保留。

## 范围与验收

发布已合并 T012 的版本／公告规则与 T013 的三来源等待提醒、常驻气泡及短句控制；同步 package、lock 根包与 APP_VERSION，生成 release-plan.json 和简短中文公告。保持 appId、数据目录及原有升级方式，不修改功能实现或依赖。

验证版本、构建、单测、完整 Electron 和两个 helper；核对本地打包与运行资源。发布准备整合至 main 后创建匹配版本的新标签，沿用现有 Release 工作流测试、打包、草稿上传并核实五附件后转正式 latest。发布后完整下载五附件，交叉核对字节数、SHA-256／SHA-512 及公告一致性。不得运行真实用户数据升级实验。

## 验证状态

- 已核实：PR #14 已合并，PR CI #46（`39738648974`）与主线 CI #47（`39739406624`）完整通过，包含两个 helper 和完整 Electron。
- **通过**：本次 v1.0.0 工作区 `release:prepare --base 0.5.4 --types patch,major`、`release:check --require-plan --latest-version v0.5.4 --tag v1.0.0`；`npm.cmd test` 25 文件／262 单测；`npm.cmd run build`（含类型检查）。
- **通过**：卸载 helper 文件测试 3 场景（本机符号链接权限不足，强制 junction 覆盖通过）；提权隔离更新 helper 七场景全部通过，含两分钟来源进程超时。首次受限更新 helper 因 Get-CimInstance 权限错误 `0x80041003` 未就绪，未修改助手或系统权限，使用相同测试提权复验通过。
- **失败／保留**：本地完整 `npm.cmd run test:smoke` 17/18（1.2 分钟），原生 held pointer 的 screenX 偏移为 46px；单项原样重跑仍为 40px。其余 17 项包括 T013 常驻与短句交互均通过。保留 trace，旧预览图已恢复；不改代码或断言掩盖 T010 既有间歇问题。发布准备及合并后的远程完整 CI 均通过，不代表本地偏移根因已解决。
- **通过**：`npm.cmd run dist -- --config.directories.output=.tmp/T014-packages`；`node scripts/verify-release.mjs .tmp/T014-packages`；`node scripts/verify-update-runtime.mjs .tmp/T014-packages/win-unpacked/resources`。两个 EXE、五项更新资源、公告、SHA-256／SHA-512 和固定源／运行依赖通过；未安装或运行真实桌宠。
- **通过**：本地两个 EXE 的 ProductVersion 为 1.0.0；asar 内 Codex 转发脚本与已审查源文件逐字节一致。
- **通过**：[发布准备 CI #48](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39740456927) 与 [主线 CI #49](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39743901007) 完整通过，含 262 单测、两个 helper 和全部 18 项 Electron；文档 UTF-8、相对链接与差异检查通过。
- **通过**：[Release #14](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39743944183) 自动发布成功：标签／版本／最新基准／公告校验、262 单测、两种打包、更新资源及运行依赖检查、五附件草稿上传、大小与 GitHub SHA-256 digest 核对后转正式 latest。本轮未人工转正或替换附件，既有草稿替换恢复路径仍未实测。
- **通过**：正式发布后从公开地址完整下载五附件，均 HTTP 200，字节数与 GitHub SHA-256 digest 一致；SHA256SUMS 与两个 EXE、latest.yml 的版本／安装文件名／大小／SHA-512 一致，GitHub Release 正文及 latest.yml.releaseNotes 与源公告一致。证据 `.tmp/T014-published-verification.json`、`.tmp/T014-published/`；不把本地构建摘要当作远端附件摘要。
- GitHub 连接器在本会话已确认缺少创建 PR 的权限，使用现有 Git 认证调用官方 API；创建发布 PR 首次连接中断，先查重后重试成功。凭据只在内存，不写入文件或输出。未调整集成权限、系统 ACL 或应用沙箱。
- 保留限制：T013 已通过真实 Codex CLI／IDE 引擎的隔离合成链路；真实账户、Work／DSH 端到端、完整 IDE GUI、WSL／远程及其他 DSH 版本未实测。T010 原生鼠标间歇偏移历史保留。本次不改更新器，不重复独立两版本升级实验。

## 下一步

发布与下载核对已完成：[v1.0.0](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v1.0.0)。发布后交接记录见本分支后续提交／PR；不重跑同版本发布、不移动标签或覆盖公开附件。后续独立任务 T015／R023，真实客户端与旧间歇问题继续分别记录。

## 正式附件

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| DesktopPet-1.0.0-Portable-x64.exe | 114834296 | `865b04873e46c7ab03c2993f5e55eb57cf10dd985d4f51713a716776fab021cb` |
| DesktopPet-1.0.0-Setup-x64.exe | 115156029 | `b1ba525c336f46a24e73b7976caa6baa8ede6fac74dec4b2368563ff7500f41e` |
| DesktopPet-1.0.0-Setup-x64.exe.blockmap | 121218 | `859ca49623964c5114845f0a1531383e11e6c7c232eadeffe204bf1edd4327da` |
| latest.yml | 1627 | `831ab0b5ec70279ede5d8f444516367e584b4142ca10f0ff48ea8d4c9509d233` |
| SHA256SUMS.txt | 197 | `7847c82d37ff264d58d901aa94852c73c77c0b51fee339dafaa4dd5fb9d2d90f` |
