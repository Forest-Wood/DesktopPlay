# DesktopPet 当前项目状态

更新日期：2026-10-15（Asia/Shanghai）。本文件仅保留当前有效状态；约定见 [AGENTS.md](../AGENTS.md)，验收见 [需求登记](REQUIREMENTS.md)，实施细节见任务记录。

## 仓库与任务

| 项目 | 当前事实 |
| --- | --- |
| 工作目录 | `D:\desktop1\DesktopPlay` |
| 当前分支／目标 | `feat/T001-bubble-settings` → `main` |
| 本轮分支基准 | `7ac1192094636ac09334d79c40412bc64598b2bb`；已 fetch 并核实为 origin/main，包含 PR #1 合并；当前 HEAD 以 Git 为准 |
| 源码版本 | package、锁文件根包与 APP_VERSION 均为 0.5.1 |
| T001 提交／PR | 业务提交 `f5a78fac3d5d982afc4edb69721fe98af142d753` 已推送，[PR #2](https://github.com/Forest-Wood/DesktopPlay/pull/2) 已创建，待审查／CI，未合并；交接同步提交见 Git 历史 |
| T002 提交／PR | [PR #1](https://github.com/Forest-Wood/DesktopPlay/pull/1) 已合并；主提交 66eef1a、交接 c00a87f，合并提交为上述基准 |

| 任务 | 状态 | 范围 |
| --- | --- | --- |
| [T001：v0.5.1 气泡与页面调整](tasks/T001-v051-bubble-settings.md) | 待审查 | R001–R004；本轮复验通过，独立功能提交已推送，PR #2 已开启；尚未合并 |
| [T002：项目协作与交接规范](tasks/T002-project-guidance.md) | 已合并 | R005；远程 PR 状态与 origin/main 已核实，未据此推定独立审查结论 |

本轮继续原有 T001，未新建重复任务。创建功能分支前核对了 21 个既有文件的 SHA-256，完整保留了功能实现，再从已合并 T002 的最新主线创建分支；不重写共享历史。下一个可分配编号仍为 T003／R006，分配前须检查占用。

## 当前改动与定位

- T001 范围为气泡／设置／额度样式、共享设置类型及默认值、主进程设置校验和窗口底色、版本文件、unit／smoke 测试、README／设计／发行说明及 v0.5.1 预览图。同步交接、需求与任务状态；T002 记录仅修正为已合并，不修改已合并的指南或 PR 模板。
- 气泡计时见 `src/renderer/pet.ts`；设置跨 `src/shared/`、`src/main/services/desktop-service.ts`、`src/renderer/settings.ts`。GPT 排版见 `quota.css`，白色页面见 `settings.css` 与设置窗口配置。
- 本机测试可选 `DESKTOPPLAY_TEST_SOFTWARE_RENDERING=1`，仅向测试进程增加 `--disable-gpu`；正常应用和默认 CI 不变。复现命令见 T001。
- 环境和常用命令统一见 AGENTS.md；实际定义以 [package.json](../package.json)、[开发脚本](../scripts/dev.mjs)和 [CI](../.github/workflows/ci.yml)为准。Node.js 24、npm；PowerShell 使用 npm.cmd。
- 产品名为 DesktopPet，兼容标识与数据目录保持 `io.github.forestwood.desktopplay`／`%APPDATA%\DesktopPlay`。新增设置有默认值、主进程校验及旧配置兼容；没有新 IPC 或持久化格式版本迁移。
- 安装版和免安装版 0.5.1 已在本地生成，连同 SHA256SUMS-0.5.1.txt 保存在被忽略的 `release/`。本轮不重复打包；未创建发行标签或 GitHub Release。说明与截图见 [v0.5.1](releases/v0.5.1.md)。

## 本轮验证

| 结果 | 检查 | 说明 |
| --- | --- | --- |
| 通过 | 远程与分支检查 | 已核实 PR #1 合并、最新主线、任务分支与原有文件保护 |
| 通过 | `npm.cmd run build`、`npm.cmd run typecheck` | 生产构建及新增测试辅助文件类型检查 |
| 通过 | `npm.cmd test` | 119 项单元测试通过 |
| 通过 | 设置软件渲染变量后 `npm.cmd run test:smoke` | 本轮 7 项通过，使用隔离配置且不读真实 Codex；包含两种 GPT 造型、完整倒计时、气泡计时、设置保存与重启 |
| 通过 | 新预览图检查 | 软件渲染结果中白龙完整倒计时保持单行；此前同一业务实现的安装包版本与校验和核对已通过 |
| 通过 | 提交范围与推送／PR | 恰为 26 个任务文件，版本统一为 0.5.1，提交树文档链接通过；功能分支已推送，PR #2 已创建，未将本地安装包加入 Git |
| 失败（替代通过） | 默认 GPU 下完整 smoke | 点击稳定／截图等待超时；隔离帧诊断后仅对测试启用软件渲染，完整回归通过；保留环境限制，不修改正式运行设置 |
| 失败（已有替代方式） | 沙箱内 Electron、默认工具下载／缓存路径 | 本机已有 ACL 与网络／缓存限制；测试在沙箱外执行，前次使用本地缓存打包；详见 T001 |
| 未运行 | 本轮重新打包、真实账户、真实安装升级／完整卸载、helper fixtures | 本轮提交未改变此前打包的业务实现；不把界面或单测结果当作真实安装卸载验收 |

## 下一步

1. 审查 [功能 PR #2](https://github.com/Forest-Wood/DesktopPlay/pull/2) 并查看最新 CI；远程结果未据本地测试推定通过。
2. 后续修改继续原分支；本次未授权自动合并或发布。工作区状态与远程提交一致性以 Git 最终检查为准。
3. 若后续发布 v0.5.1，另行核实发布授权、标签版本、CI 与下载附件；真实安装／卸载及账户验证缺口保持待确认，见 [v0.5.0 历史限制](releases/v0.5.0.md)。
