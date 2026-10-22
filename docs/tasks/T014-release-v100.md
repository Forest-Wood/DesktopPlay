# T014：发布 DesktopPet v1.0.0

- 日期：2026-10-22（Asia/Shanghai）；负责人：Codex；需求 R022；目标 main。
- 工作目录：`D:\desktop1\DesktopPlay`；分支：`release/T014-v100`；基准 `7ac74a2ef2f09d33269f3a61bd5b2880f53dfec0`（PR #14 已合并）；结果提交：未提交。
- 开始时 T013 工作区干净，无带入修改。用户明确要求发布新的 Release，授权本次版本准备、必要验证、提交／推送／整合、新标签和正式发布。
- 已核实最新正式版本为 v0.5.4（Release `419779328`），无 v1.0.0 标签或草稿。按 T012 规则，T013 三桌宠新增等待提醒及短句控制为 major，完成气泡完善为 patch；取最高档一次升至 1.0.0。
- 状态：发布准备中；尚未创建标签或正式发布，不移动旧标签、不覆盖旧正式附件。

## 范围与验收

发布已合并 T012 的版本／公告规则与 T013 的三来源等待提醒、常驻气泡及短句控制；同步 package、lock 根包与 APP_VERSION，生成 release-plan.json 和简短中文公告。保持 appId、数据目录及原有升级方式，不修改功能实现或依赖。

验证版本、构建、单测、完整 Electron 和两个 helper；核对本地打包与运行资源。发布准备整合至 main 后创建匹配版本的新标签，沿用现有 Release 工作流测试、打包、草稿上传并核实五附件后转正式 latest。发布后完整下载五附件，交叉核对字节数、SHA-256／SHA-512 及公告一致性。不得运行真实用户数据升级实验。

## 验证状态

- 已核实：PR #14 已合并，PR CI #46（`39738648974`）与主线 CI #47（`39739406624`）完整通过，包含两个 helper 和完整 Electron。
- **通过**：本次 v1.0.0 工作区 `release:prepare --base 0.5.4 --types patch,major`、`release:check --require-plan --latest-version v0.5.4 --tag v1.0.0`；`npm.cmd test` 25 文件／262 单测；`npm.cmd run build`（含类型检查）。
- **通过**：卸载 helper 文件测试 3 场景（本机符号链接权限不足，强制 junction 覆盖通过）；提权隔离更新 helper 七场景全部通过，含两分钟来源进程超时。首次受限更新 helper 因 Get-CimInstance 权限错误 `0x80041003` 未就绪，未修改助手或系统权限，使用相同测试提权复验通过。
- **失败／保留**：本地完整 `npm.cmd run test:smoke` 17/18（1.2 分钟），原生 held pointer 的 screenX 偏移为 46px；单项原样重跑仍为 40px。其余 17 项包括 T013 常驻与短句交互均通过。保留 trace，旧预览图已恢复；不改代码或断言掩盖 T010 既有间歇问题。发布准备的远程完整 CI 仍需单独通过。
- **通过**：`npm.cmd run dist -- --config.directories.output=.tmp/T014-packages`；`node scripts/verify-release.mjs .tmp/T014-packages`；`node scripts/verify-update-runtime.mjs .tmp/T014-packages/win-unpacked/resources`。两个 EXE、五项更新资源、公告、SHA-256／SHA-512 和固定源／运行依赖通过；未安装或运行真实桌宠。
- 待运行：发布准备 CI 和 Release 工作流、正式下载核对。
- 保留限制：T013 已通过真实 Codex CLI／IDE 引擎的隔离合成链路；真实账户、Work／DSH 端到端、完整 IDE GUI、WSL／远程及其他 DSH 版本未实测。T010 原生鼠标间歇偏移历史保留。本次不改更新器，不重复独立两版本升级实验。

## 下一步

完成发布准备与验证，提交／推送并整合；创建新标签触发 Release 工作流。核实正式 latest、公告和五附件公开下载后更新交接。
