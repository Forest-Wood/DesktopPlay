# DesktopPet 当前项目状态

更新日期：2026-10-22（Asia/Shanghai）。入口见 [AGENTS.md](../AGENTS.md)、[需求登记](REQUIREMENTS.md)。代码和实际验证用于核实，发布历史详见各任务记录。

## 当前工作

- [T010](tasks/T010-persona-notifications.md) 已由 [PR #10](https://github.com/Forest-Wood/DesktopPlay/pull/10) 合并到 `fcf3f30`；[PR CI #36](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39629868426) 通过。包含 DSH v4 普通／Zstandard 提醒、三桌宠全部气泡档案、三来源独立文案和完成音效。
- 用户已授权发布新的 Release；[T011](tasks/T011-release-v054.md) 正准备 v0.5.4。工作目录 `D:\desktop1\DesktopPlay`，分支 `release/T011-v054`，目标 main，基准 `fcf3f30`；开始时干净，本任务发布准备未提交。
- 已 fetch 核实远程 main；当前正式 latest 为 [v0.5.3](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v0.5.3)，Release `418176374`。尚无 v0.5.4 标签／草稿，不改动旧发布。

## 验证状态

- **通过**：T010 PR CI 与[主线 CI](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39631043773) 完整通过，含两个 helper 和 Electron；T011 v0.5.4 工作区本地构建／类型与 223 单测通过。
- **待执行**：发布准备 CI、Release 工作流打包与五附件核实、正式 latest 与公开下载核实。
- **保留限制**：T010 本地完整 Electron 一轮 15/16，原生鼠标偏移 26px、容差 1px；原样单独重试通过，未解决根因。更早失败／恢复记录见 T010／T009，不用新的通过结果抹除。
- **未运行**：真实账户与真实 DSH／Work 端到端、真实用户数据覆盖升级、WSL／远程／其他 DSH 格式。本次不改更新器实现，不重复独立两版本升级实验；隔离测试不代替真实试用。

## 兼容与发布约定

appId、数据目录 `%APPDATA%\DesktopPlay`、安装版与 portable 共用数据约定保持不变。新设置迁移旧时长、短句、文案和共享开关，严格校验并原子保存；不保证旧二进制降级读取新字段。DSH 默认监听开启，完成声音默认关闭。自定义 GPT 共用原版档案。

v0.5.3 用户可在软件内更新；更早版本可直接手动覆盖升级，无需卸载或删除数据。既有 v0.5.3 发布核实及匿名源限流限制见 [T009](tasks/T009-release-v053.md)。本次只测试隔离数据，不拿真实桌宠做升级实验。

## 下一步

完成 T011 发布准备、整合、新标签及正式 Release，记录实际 CI、发布结果和五附件摘要。新独立任务下一编号 T012／R017。
