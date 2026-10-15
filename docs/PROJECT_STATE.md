# DesktopPet 当前项目状态

更新日期：2026-10-15（Asia/Shanghai）。本文件只保留当前有效概况；协作约定见 [AGENTS.md](../AGENTS.md)，验收条件见 [需求登记](REQUIREMENTS.md)，实现与验证细节见对应任务记录。

## 仓库与工作区

| 项目 | 当前事实 |
| --- | --- |
| 工作目录 | `D:\desktop1\DesktopPlay` |
| 当前分支／目标合并分支 | `docs/T002-project-guidance` → `main` |
| T002 基准提交 | `b7ed57f9b8558a8569fade14b3feb27a40039825`，`test: resolve Windows runner short paths in uninstall fixtures`；当前 HEAD 以 `git rev-parse HEAD` 为准 |
| 对应业务版本 | 目标 `main` 基准的本地标签为 `v0.5.0`；本次文档提交不包含 v0.5.1 业务实现 |
| 远程核实 | 2026-10-15 已成功 `git fetch origin`；当次 `origin/main` 与 HEAD 相同，双方提交差 0／0；不代表以后仍相同 |
| 原工作区源码版本 | package、锁文件根包及 `APP_VERSION` 均为 `0.5.1`，属于 T001 未提交修改；本次文档分支的已提交业务树仍为 `0.5.0` |
| 暂存与提交 | 暂存区为空；T001、T002 均未形成实现提交，未推送、创建 PR、合并或发布新标签 |

工作区保留 T001 的源码、版本、测试、文档及截图修改，并新增 T002 管理文件。T002 分支创建时保留了原来位于 `main` 的 T001 未提交修改，不能将整个工作区视作 T002 产出；后续提交前须按任务整理。

## 当前任务与未提交工作

| 任务 | 状态 | 范围与定位 |
| --- | --- | --- |
| [T001：v0.5.1 气泡与页面调整](tasks/T001-v051-bubble-settings.md) | 待审查 | R001–R004；默认 3 秒气泡、可保存的显示／悬浮延长时间、完整 GPT 倒计时单行、白色设置页；已实现并本地验证，未提交 |
| [T002：项目协作与交接规范](tasks/T002-project-guidance.md) | 待审查 | R005；6 个管理文件的内容、链接与范围检查通过，21 个既有文件保持原样，未提交 |

- **T001 未提交文件**：`src/main/` 的窗口／设置服务，`src/renderer/` 的气泡／额度样式／设置，`src/shared/` 类型及默认值，package 与锁文件，相关 unit／smoke 测试；`README.md`、`DESIGN.md`、`docs/release.md`、`docs/releases/v0.5.1.md` 和 `docs/previews/v0.5.1/`。精确清单见 T001，实时差异以 Git 为准。
- **T002 文件**：`AGENTS.md`、`.github/pull_request_template.md`、`docs/REQUIREMENTS.md`、本文件和 `docs/tasks/` 下的 T001／T002 记录。已有 T001 文件应保持原样；本文件按本次授权重写过时状态。
- **被忽略的本地产物**：`release/DesktopPet-0.5.1-Setup-x64.exe`、`release/DesktopPet-0.5.1-Portable-x64.exe`、`release/SHA256SUMS-0.5.1.txt` 与当前 `SHA256SUMS.txt` 已生成。忽略目录不等于 Git 已提交或远程已发布。
- 下一个可分配任务编号为 `T003`，需求编号为 `R006`；分配前仍须检查其他并行工作是否已经占用。

## 定位与兼容边界

- 环境、关键目录和开发／构建／验证命令统一维护在 [AGENTS.md](../AGENTS.md)；实际定义以 [package.json](../package.json)、[开发脚本](../scripts/dev.mjs)和 [CI](../.github/workflows/ci.yml)为准。当前环境已核实 Node.js `v24.18.0`、npm `11.16.0`。
- 桌宠计时入口为 `src/renderer/pet.ts`；设置跨 `src/shared/types.ts`／`defaults.ts`、`src/main/services/desktop-service.ts` 和 `src/renderer/settings.ts`。具体行为与验收见 R001／R002。
- GPT 排版入口为 `quota.ts`／`quota.css`；白色设置页入口为 `settings.css` 和主进程设置窗口底色。设计入口为 [DESIGN.md](../DESIGN.md)，v0.5.1 的设计修改与发行说明 `docs/releases/v0.5.1.md` 属于 T001 未提交文件。
- 产品名 DesktopPet，兼容标识保持 `io.github.forestwood.desktopplay` 和 `%APPDATA%\DesktopPlay`。真实凭据、账本和用户素材未作为本次任务输入，也不应进入提交。

## 验证状态

以下区分任务与验证对象；T001 的既有结果没有作为 T002 的重新运行结果。

| 结果 | 对象与检查 | 记录 |
| --- | --- | --- |
| 通过 | T001 的 0.5.1 未提交实现 | 119 项单元测试、7 项 Electron smoke、TypeScript／生产构建、截图检查、本地缓存打包与包版本／SHA-256 核对；细节见 T001 |
| 通过 | T002 的开始状态、远程获取与分支检查 | 已核实工作目录、分支、HEAD、暂存区及远程 `main`，保留已有修改后创建任务分支 |
| 失败（已重试通过） | T002 沙箱内 `git fetch origin` | github.com:443 连接失败；沙箱外重试成功，无当前 fetch 阻塞 |
| 失败（替代方式通过） | T001 原始环境下的 npm／Electron／默认打包 | 执行策略、AppContainer ACL 及工具下载／缓存权限问题；改用 `npm.cmd`、沙箱外测试与本地工具后完成；复现方式见 T001 |
| 通过 | T002 管理文档与范围验证 | 6 个文档的链接／锚点、六组约定、需求与任务关联、命令及必需字段通过；21 个既有文件 SHA-256 一致；`git diff --check` 通过，暂存区为空 |
| 失败（已修正并通过） | T002 初次内联文档校验 | PowerShell 管道编码导致脚本中的中文被替换；设置 UTF-8 后重跑通过，细节见 T002 |
| 未运行 | T002 类型检查、单测、构建与 smoke | 仅修改 Markdown，不重跑业务验证 |
| 未运行 | 本次真实账户、真实安装覆盖升级／完整卸载及 helper fixtures | 不能由单测或加载构建产物的 Electron 测试推定已通过；历史限制见 [v0.5.0](releases/v0.5.0.md) |

## 下一步与待确认

1. 审查 T002 的管理文档与任务约定，按明确授权仅提交本任务文件；提交后记录真实提交编号与审查结果。
2. 安全整理 T001 的独立实现分支与提交范围，保留当前所有修改；后续同步或解决冲突后重跑受影响的验证。
3. 若需要远端交付，再核实发布授权、远程状态、CI、标签版本和下载附件；当前仅有本地产物。[发布流程](release.md)与 [Release 工作流](../.github/workflows/release.yml)分别描述操作与实际自动化行为。
4. 真实账户协议兼容、安装／卸载完整验收、两项任务的审查人及最终提交编号均待后续确认。本轮没有以文档初始化扩大这些验证或发布范围。
