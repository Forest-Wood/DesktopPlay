# DesktopPet 当前项目状态

更新日期：2026-10-22（Asia/Shanghai）。入口见 [AGENTS.md](../AGENTS.md)、[需求登记](REQUIREMENTS.md)。代码和实际验证用于核实，发布历史详见各任务记录。

## 当前工作

- [T013](tasks/T013-conversation-attention.md) 已实现三来源等待回应、常驻对话气泡及短句候选／数量／随机顺序控制，本地验证通过。**未提交、未推送，待审查，未发布**。
- 工作目录 `D:\desktop1\DesktopPlay`；分支 `feat/T013-conversation-attention`；基准为最新 main `f43b0154619b77145374a3c21fd49ecbdbc786a8`，结果提交：未提交。开始时干净，无带入修改；普通开发保留版本 0.5.4。
- 开始时受限 fetch 失败，提权 `git fetch origin main` 成功，核实 [T012／PR #13](https://github.com/Forest-Wood/DesktopPlay/pull/13) 已合并。版本规则与更新公告仍有效。
- [v0.5.4](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v0.5.4) 发布记录见 [T011](tasks/T011-release-v054.md)，标签源码 `9be3fd6`，Release `419779328`；本任务未更改历史标签／Release／附件。

## 验证状态

- **通过**：T013 类型检查、构建、25 文件／262 单测；最终完整隔离 Electron **18/18（1.2 分钟）**，包括旧原生鼠标和新常驻／短句交互。截图已目视检查。
- **通过**：真实 Codex 0.162.0-alpha.17.2 的独立 CLI TUI 提问／审批及 IDE 捆绑 app-server 协议链路；回环合成模型、隔离 CODEX_HOME，无真实账户或付费推理。转发不可用时原审批请求仍出现；含空格、美元符、单引号路径验证通过。命令、证据、适用范围见 T013。
- **失败后修复**：完整 Electron 初轮 15/18 的旧语义断言；修正后相关 11/11、最终完整 18/18。PowerShell 命令引号／模板替换、测试 stdin／迁移文件名和模型 fixture 的失败均保留在 T013。
- **环境限制**：受限 Electron 因已有 AppContainer ACL 失败，提权隔离测试通过；未改 ACL、未关闭应用沙箱。T010 旧原生鼠标间歇偏移根因仍未解决，不能用本轮通过抹除历史。
- **未运行**：真实 Work／DSH 端到端、真实账户、完整 IDE GUI、打包／安装卸载／覆盖升级、WSL／远程和其他 DSH 版本。运行时合成验证与真实客户端试用分别记录。

## 兼容与发布约定

appId、数据目录 `%APPDATA%\DesktopPlay` 及安装／portable 共用数据保持不变。新增设置迁移旧短句和气泡规则，非法配置原子拒绝；不保证旧二进制降级读取。自定义 GPT 仍共用原版档案。

对话等待与完成气泡改为点击前常驻，普通气泡沿用计时。隐藏／退出清空提醒，不补历史。三来源等待开关独立；Codex hook 接入默认关闭，用户通过保存设置启用并在原客户端信任，关闭只移除 DesktopPet 项。Work 原生通知需开启，DSH 仅 v4。

短句 N 为 0–20、候选不少于 N；旧配置全选且默认顺序。每轮数量、候选与模式持久化；运行时顺序游标不跨进程保存。

v0.5.3 用户可在软件内更新；更早版本可直接手动覆盖升级，无需卸载或删除数据。既有 v0.5.3 发布核实及匿名源限流限制见 [T009](tasks/T009-release-v053.md)。本次只测试隔离数据，不拿真实桌宠做升级实验。

## 下一步

审查 T013 工作区差异；提交、推送、PR 和发布按后续授权。真实 Work／DSH 与 IDE GUI 试用分别补记录。下一独立任务编号 T014／R022，不覆盖已发布 v0.5.4。
