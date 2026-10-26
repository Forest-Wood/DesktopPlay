# DesktopPet 当前项目状态

更新日期：2026-10-27（Asia/Shanghai）。入口见 [AGENTS.md](../AGENTS.md)、[需求登记](REQUIREMENTS.md)。代码和实际验证用于核实。

## 当前工作

- [T019：全局桌宠模式、版本分类与 DeepSeek 本地时间](tasks/T019-pet-mode-local-time.md) 已实现并通过本地验证，待审查、未提交。分支 `feat/T019-pet-mode-local-time`，基准 `origin/main` `75f58a1`（已 fetch），工作目录 `D:\desktop1\DesktopPlay`；任务开始时工作区干净。本次所有源码／测试／文档改动均为 T019，未推送、未创建 PR、未发布，版本保留 `1.0.1`。
- T019 新增全局简洁／完整模式；DeepSeek 电脑时区日分段与峰谷状态；major 由用户决定、新功能 minor、优化 patch。旧账本原金额／北京时间日期保留，新记录保存时区及分段；2026 假期已核实，其他年份提示待核实。接口／兼容细节见 T019 与 DESIGN。

- [T018：优化 GitHub PR 创建流程](tasks/T018-github-pr.md) 的 [PR #21](https://github.com/Forest-Wood/DesktopPlay/pull/21) 已合并至 main `75f58a1`，本次 fetch 核实。gh 为首选，`pr:create`、查重及离线校验命令保留备用；入口见 [GitHub PR 流程](github.md)。
- [T017：hook 接入后提问未提醒诊断](tasks/T017-hook-diagnosis.md) 的 [PR #20](https://github.com/Forest-Wood/DesktopPlay/pull/20) 已合并至 main `9dab763`，仅诊断文档；真实客户端完全重启后的恢复仍待验证。隔离已复现旧会话后接入无转发、新会话恢复，尚不能认定为两个客户端的唯一原因。
- [T016：v1.0.1](tasks/T016-release-v101.md) **已于 2026-10-23 12:48:44（Asia/Shanghai）正式发布为 latest**，Release `421460724`，公开五附件下载、摘要及公告一致性核实通过。[正式下载](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v1.0.1)。
- T016 工作目录 `D:\desktop1\DesktopPlay`；发布分支 `release/T016-v101`；基准 `d39b9ec`；发布准备 `a5ad485` 经 [PR #18](https://github.com/Forest-Wood/DesktopPlay/pull/18) 合并为 `7755edc48751c6ca02afd53fd6828e134212f437`。发布后交接 [PR #19](https://github.com/Forest-Wood/DesktopPlay/pull/19) 已合并为 `8df8721`；T017 诊断 [PR #20](https://github.com/Forest-Wood/DesktopPlay/pull/20) 随后合并为 `9dab763`，真实客户端待验收限制保留。
- [T015：GPT 询问提醒修复](tasks/T015-gpt-attention.md) 已由 [PR #17](https://github.com/Forest-Wood/DesktopPlay/pull/17) 合并至 main `d39b9ec`；实现 `49c2311`、交接 `5cf9fa5`。PR CI #53 与主线 CI #54 完整通过。隔离验证通过，真实 GUI 待验收。
- 已补 ChatGPT App local／durable 三类等待通知、CLI／VS Code hook 接入引导、来源区分及最近事件诊断。ChatGPT 按原生会话可见性规则提醒；用户明确 VS Code 有提问／审批就提醒，包括正在查看的会话。真实设置、信任及通知偏好未更改。
- 标签 v1.0.1 对象 `e0ee1270c1fe103c1f038d53fa5dd8958073683f` 指向 `7755edc`，源码树与通过发布准备 CI 的 `a5ad485` 一致；T015 已随本版发布，按已有功能修复取 patch。旧 [v1.0.0／T014](tasks/T014-release-v100.md)（Release `420443336`，源码 `13a3951`）与更早版本、标签、附件保持不变。

## 验证状态

- **T019 通过**：`npm.cmd test` 27 文件／302 单测；`npm.cmd run build`（含类型检查）；`npm.cmd run test:smoke` 23/23；`npm.cmd run release:check` 仍验证 v1.0.1；`git diff --check`。新增模式、旧账本迁移、时区往返／夏令时、峰谷边界及声音／提醒过滤覆盖；已目视检查隔离截图；最终时间偏移展示调整后重新构建及相关 3/3 Electron 通过。
- **T019 限制**：未查询真实账户，未直接更改 Windows 时区，未打安装包或发布；时区使用注入 IANA 时区及固定时刻验证，通知使用隔离源与合成事件，不替代真实客户端验收。中间 smoke 参数类型错误及恢复见任务记录。

- **T018 通过／限制**：新增 16 单测、类型检查、CLI check／help、脚本语法与文档检查通过。本次提交前使用隔离 TEMP／TMP，26 文件／282 项直接通过；历史受限临时目录失败与恢复仍保留记录。备用命令测试使用伪凭据和模拟 HTTP，本次真实 PR 使用 gh 交付，不作为备用命令真实写入验收；未运行本地应用构建与 Electron 冒烟，详见 T018。
- **T017 通过／待验收**：v1.0.1 真实设置、hook 文件和信任状态只读核实；原生同步四场景回归、旧会话后接入无转发与新会话恢复的对照复现。两客户端最近均使用异步提问，动态工具隔离转发通过，但真实异步环境未复现；未注册工具的三个探针不适用，不据此认定异步为根因。App 无原生提问通知记录，不据此认定通知偏好关闭。完整记录及待重启验收见 T017。
- **通过**：T016 v1.0.1 版本／公告检查、npm ci、25 文件／266 单测、完整 20/20 Electron、卸载 helper 三场景、更新 helper 七场景、安装／免安装打包及资源／运行依赖／hook 校验；生产依赖审计 0 项。发布准备 CI #55、合并主线 CI #56 和 Release #15 均成功；草稿核实后自动转正，公开五附件 HTTP 200、大小、SHA-256／SHA-512、Release 正文和软件更新公告一致。
- **通过**：T015 `npm.cmd test`，25 文件／266 单测；`npm.cmd run build`（含类型检查）；差异空白检查。旧解析器 local 三种事件全部拒绝，而旧 19 单测仍通过的缺口已复现并增加覆盖。
- **通过**：IDE 捆绑原生 Codex 0.162.0-alpha.17.2 的四场景 app-server 验证：未信任 hook 被跳过但原提问保留；提问／审批转发；转发不可用时原审批保留。使用隔离 CODEX_HOME 与回环合成模型，无登录／付费推理。证据和失败恢复见 T015。
- **通过**：相关五文件 11 个 Electron 场景均已有通过记录。提权首轮 10/11；补充新增测试的渲染与异步文件清理等待后，新两项最终 2/2（9.5 秒）通过。包含原有完成／常驻／文案／音效队列、DeepSeek 与新增 App／hook 文件到气泡链路；设置截图已目视核验。
- **环境失败／恢复**：受限 Electron 相关 11 项遇已有 AppContainer ACL 拒绝启动，沿用提权隔离环境，未改 ACL、未关闭应用沙箱。受限 CIM 只读进程查询拒绝访问，提权后成功核实 App／IDE 引擎宿主名称。测试时序失败与恢复详见 T015。
- **未运行**：真实 ChatGPT 三模式完整 GUI（当前会话／其他会话／后台／最小化）、完整 VS Code GUI、真实 DSH、真实安装／覆盖升级、WSL／远程。合成日志及原生引擎协议验证不替代这些场景。
- **历史限制**：T010／T014 的本地原生鼠标间歇偏移根因仍未解决；T014 本地 17/18、远程完整 CI 通过。历史细节见各任务，不以远程或后续一次通过声称根因已解决。

## 兼容与后续

appId、数据目录 `%APPDATA%\DesktopPlay`、安装／portable 共用数据和现有来源存储键不变。等待与完成气泡点击前常驻，隐藏／退出清空并不补历史。Codex hook 默认关闭，需要用户保存接入并在原客户端信任；App 原生提问／权限通知需开启。DeepSeek 保持 v4 普通／压缩来源。运行时诊断 lastAttentionAt 不持久化、不含正文或账户标识。

本版发布与下载核实已完成；发布后交接记录见 PR #19。接入 hook 后需重新加载会话配置，建议保存工作后完全退出并重启 VS Code；App 原生通知另按可见性与通知偏好验收。真实客户端试用按 T015／T017 矩阵分别补记录。后续独立任务编号 T020／R027。不重跑同版本发布、不移动标签或覆盖附件。
