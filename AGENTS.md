# DesktopPet 协作指南

本文件适用于仓库根目录及其子目录。进入具体目录前检查是否存在更具体的 `AGENTS.md`，并结合本次任务授权执行。以下约定用于日常开发，不代表已经获得提交、推送、合并或发布的授权。

## 项目与关键入口

DesktopPet 是 Windows 10/11 x64 桌宠：DeepSeek 小鲸鱼显示余额与本地观测消费，GPT 原版／白龙显示本机 Codex 编程额度。内部包名和仓库名仍为 DesktopPlay。界面使用 TypeScript、DOM 和 CSS，桌面运行时为 Electron，构建采用 Vite 与 esbuild。

| 目录或文件 | 职责 |
| --- | --- |
| `src/main/main.ts` | Electron 窗口、托盘、IPC、状态广播与应用生命周期 |
| `src/main/services/` | DeepSeek 余额／账本、Codex 额度读取与服务状态 |
| `src/main/pet-assets.ts`、`sound-assets.ts`、`uninstall.ts` | 角色素材、音效文件、卸载管理 |
| `src/preload/index.ts` | 渲染层可调用的白名单 API |
| `src/shared/` | 共享类型、默认设置、应用版本与桌宠布局 |
| `src/renderer/` | 桌宠气泡、额度排版、设置页及浏览器演示 API |
| `tests/unit/`、`tests/smoke/` | Vitest 单元测试与 Playwright Electron 交互测试 |
| `tests/helper-fixtures.ps1` | 卸载辅助脚本的隔离文件验证 |
| `scripts/`、`build/`、`.github/workflows/` | 开发／构建脚本、安装卸载资源、CI 与发布工作流 |
| `public/assets/` | 随应用分发的内置素材 |

## 项目恢复与交接

- 开始新任务时，读取 `docs/PROJECT_STATE.md`；架构和设计决定文档仅在相关时读取。
- 文档用于定位，当前代码和实际验证结果用于核实。
- 先搜索相关文件和符号，再按需读取；避免无目的全仓扫描。优先使用 `rg --files` 和 `rg`，通常排除依赖、构建产物和临时目录。
- 完成或暂停任务时，更新 `PROJECT_STATE.md` 的当前状态；本项目的实际路径为 `docs/PROJECT_STATE.md`。
- 记录日期、对应提交、未提交工作、验证结果和下一步。
- 未运行、失败和通过的验证必须分别标明。记录命令、适用提交或工作区、结果及必要限制；重试成功时保留会影响复现的失败原因。
- 删除或改写已经过时的状态，避免不断追加聊天记录。只保留仍有效的限制、待办和定位信息，任务过程及重要决定移入相应任务记录。

## Git 与协作约定

- 开始任务时检查仓库目录、当前分支、提交和工作区状态。
- 读取本任务说明；按需读取项目状态和相关设计文档。
- 在指定任务分支和工作目录中修改。
- 保留已有修改，只提交本任务相关内容。不得把开始任务前的未提交修改当成本任务产出；在任务记录中注明其归属。
- 避免无关重构、全仓格式化和无关依赖升级。
- 修改公共接口、数据库结构或其他任务负责的文件前，先说明影响并协调修改范围。本项目尤其注意共享类型、IPC 和本地持久化格式。
- 共享分支不随意改写历史；不得擅自丢弃工作或强制推送。
- 解决冲突时核实双方意图，整合后重新验证。
- 实现后检查差异并运行必要验证，准确记录结果。
- 完成或暂停时更新本任务交接文件，注明提交和下一步。
- 推送、创建 PR、合并和发布按本次明确授权范围执行。

## 初始化与事实核实

- 先检查已有 `AGENTS.md`、README、项目文档和 PR 模板，在保留有效约定的基础上补充，避免直接覆盖。
- 根据实际代码、构建配置和脚本记录项目关键目录、环境要求、启动、构建和测试命令。
- 无法确认的信息标为“待确认”；推断与已验证事实分开记录。
- 本次仅完善项目管理文件，不修改业务代码。这里的“本次”指建立本指南的 T002 初始化任务；后续任务按各自需求和授权范围执行。
- 项目很小时合并重复文档，避免建立无实际内容的文件。现有架构与设计入口使用 `DESIGN.md`，不另建空白架构文档。

## 任务、需求与分支

- 每个独立功能、修复或重构任务分配唯一任务编号，明确目标、修改范围、负责人、依赖和验收条件。使用递增编号 `T001`、`T002` 等，先检查已有任务，避免冲突。
- 新任务使用独立分支；同一任务的后续修改继续使用原分支。
- 创建分支前核实目标合并分支，获取远程状态，确认工作区修改已妥善保存。无法获取远程时记录原因与引用时效，不把本地跟踪引用当作最新远程事实，不自动同步或改写已有修改。
- 已合并任务产生新的修改需求时，创建新任务和新分支。
- 分支名包含任务编号和简短用途，例如 `feat/T012-export`、`fix/T013-quota`、`docs/T014-handoff`。本项目当前目标合并分支为 `main`；每次仍须核实任务目标与远程状态。
- 多个开发者或 AI 并行修改时使用独立工作目录，明确共享文件、接口负责人和必要的合并顺序。

## 需求与开发留档

- 项目需求保存于 `docs/REQUIREMENTS.md`；每项需求包含编号、行为说明和可验证的验收条件。使用唯一编号 `R001`、`R002` 等，并关联任务。
- 独立任务记录保存于 `docs/tasks/<任务编号>-<名称>.md`，记录关联需求、分支、重要决定、实现情况、验证和下一步。
- 任务记录至少注明日期、负责人、目标、范围、依赖、验收条件、目标合并分支、工作目录、基准／结果提交，以及已有和新增的未提交修改。没有结果提交时明确写“未提交”，不得用基准 HEAD 冒充实现提交。
- 需求发生实质变更时，记录变更内容、原因和影响；不把旧需求继续作为当前验收依据。
- 明确区分待开发、进行中、已实现待验证、待审查、已合并和阻塞状态。“已实现”不代表已验证；“验证通过”不代表已审查或已合并。阻塞时记录原因、影响和解除条件。
- 已完成任务保留结果和重要决定，详细代码历史以 Git 和 PR 为准。
- `PROJECT_STATE.md` 只保存当前有效概况并链接相关任务。并行开发时，各任务先更新自己的记录，由整合负责人更新项目总体状态。
- 需求登记从当前已确认事项开始，不凭现有功能列表补造过去未记录的用户需求或授权。

## 环境与常用命令

README 与 CI 使用 Windows x64、Node.js 24 和 npm；具体依赖与版本以 `package.json`、`package-lock.json` 为准。以下命令在仓库根执行。Windows PowerShell 建议使用 `npm.cmd`，避免系统执行策略阻止 `npm.ps1`；其他 shell 可使用 `npm`。

| 命令 | 用途与前置条件 |
| --- | --- |
| `npm.cmd ci` | 按锁文件安装依赖，可能需要下载 Electron；已有可用依赖时不为纯文档任务重复安装 |
| `npm.cmd run dev` | 构建 main/preload，再启动 Vite 与 Electron；开发端口为 `127.0.0.1:5173`，主进程变动后重启 |
| `npm.cmd run typecheck` | TypeScript 静态类型检查 |
| `npm.cmd test` | Vitest 单元测试 |
| `npm.cmd run build` | 类型检查、Vite 界面构建与 esbuild main/preload 构建 |
| `npm.cmd start` | 启动已构建的 Electron 应用，需先完成 build |
| `npm.cmd run test:smoke` | 对构建产物执行 Playwright Electron 交互测试，需可运行 Electron 的桌面环境 |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tests/helper-fixtures.ps1` | 卸载辅助脚本的隔离文件测试；不包含在 `npm test` 中 |
| `npm.cmd run dist` | 构建 Windows x64 NSIS 与 portable 包到 `release/`，配置为 `--publish never` |
| `git diff --check` | 检查工作区差异中的空白问题；不能代替功能验证 |

开发版默认也使用真实 `%APPDATA%\DesktopPlay`。开发或测试前按需设置独立 `DESKTOPPLAY_USER_DATA`，移除宿主可能带入的 `ELECTRON_RUN_AS_NODE`；测试额度界面时可使用现有 `DESKTOPPLAY_TEST_NO_CODEX=1`。现有 smoke 测试自行创建隔离目录。`DESKTOPPLAY_USER_DATA` 仅对非打包运行生效，不可据此假定打包版也已隔离。

新增 Codex 完成监听也必须隔离：非打包环境的 `DESKTOPPLAY_TEST_NO_CODEX=1` 同时把默认监听目录切到测试 profile 内的 `codex-test-home`；可用 `DESKTOPPLAY_TEST_CODEX_HOME` 指定隔离 fixture 主目录。该覆盖仅在上述测试开关开启时生效，真实版本使用用户选定目录或 CODEX_HOME／用户 `.codex`。测试不得通过更改真实 Codex 配置、真实会话或 auth.json 验证通知。

ChatGPT Work 通知日志同样隔离：上述测试开关开启时只使用测试 profile 的 `chatgpt-test-logs`，或显式的 `DESKTOPPLAY_TEST_CHATGPT_LOG_DIR`，不得自动发现真实桌面日志。模拟原生通知使用虚构账户／会话标识。真实来源调查只输出事件时间、类型和字段形状，不记录账户标识或对话正文；不得擅自改写 ChatGPT 通知配置。

按改动选择必要检查：纯文档检查链接、内容、差异和范围；共享类型与行为改动运行类型检查及相关单测；界面改动在 build 后运行相关 smoke 并检查渲染结果；卸载、安装和真实账户验证与隔离测试分别记录。一次通过后，只有新改动、失败或未解决疑点才需要扩大或重复验证。

## 兼容性与实现边界

- 产品名为 DesktopPet，但 `appId` 保持 `io.github.forestwood.desktopplay`，数据目录为 `%APPDATA%\DesktopPlay`。安装版和免安装版共享数据；不要随产品显示名更改这些兼容标识。
- 修改桥接 API 时同步检查 `src/shared/types.ts`、main IPC、preload、renderer 与 `src/renderer/demo.ts`。
- 新增设置必须提供默认值、主进程校验、旧配置读取兼容及必要的持久化验证。
- 调整版本时同步 `package.json`、`package-lock.json` 的根包版本及 `src/shared/defaults.ts` 中的 `APP_VERSION`；发行说明位于 `docs/releases/`。
- 保持渲染层隔离与白名单 IPC，不因本机测试启动失败而关闭应用的 Electron 沙箱。环境问题及替代验证方法写入任务记录。
- 密钥、登录凭据、真实账本、私人配置和导入素材不得进入提交、截图或测试 fixture。使用独立测试数据，不借开发／验证任务擅自访问真实账户或执行真实卸载。

## PR 模板与完成标准

- 检查并补充 `.github/pull_request_template.md`；使用其他托管平台时遵循其模板约定。
- 模板包含：关联需求/任务、问题与行为变化、实现要点、影响范围、验证命令与结果、兼容性或迁移要求、未完成事项。
- PR 描述基于最终差异填写，不直接复制计划或聊天记录。
- 提交前检查实际差异和暂存内容，只包含本任务相关文件。
- 完成实现后核对验收条件，运行与改动相称的验证；无法运行的检查记录原因和影响。
- 同步主线或解决冲突后，重新运行受影响的验证。
- 未经验证、审查或合并的任务，不标记为相应阶段已完成。

发布说明与命令见 `docs/release.md`，CI 和 Release 的真实行为以 `.github/workflows/` 为准。普通提交／PR 与标签发布的授权和验证范围分别核实。
