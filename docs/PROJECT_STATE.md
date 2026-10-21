# DesktopPet 当前项目状态

更新日期：2026-10-22（Asia/Shanghai）。入口见 [AGENTS.md](../AGENTS.md)、[需求登记](REQUIREMENTS.md)。代码和实际验证用于核实，发布历史详见各任务记录。

## 当前工作

- [T010](tasks/T010-persona-notifications.md) 已由 [PR #10](https://github.com/Forest-Wood/DesktopPlay/pull/10) 合并到 `fcf3f30`；[PR CI #36](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39629868426) 通过。包含 DSH v4 普通／Zstandard 提醒、三桌宠全部气泡档案、三来源独立文案和完成音效。
- [T011](tasks/T011-release-v054.md) 已完成 v0.5.4 发布。发布准备 `912cc30` 经 [PR #11](https://github.com/Forest-Wood/DesktopPlay/pull/11) 合并到 `9be3fd6`，新标签 v0.5.4 指向该提交。工作目录 `D:\desktop1\DesktopPlay`，分支 `release/T011-v054`；开始时干净，后续发布交接文档提交见分支历史。
- [v0.5.4](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v0.5.4) 已于 2026-10-22 00:16:36（Asia/Shanghai）自动发布为正式 latest，Release `419779328`；标签源码 `9be3fd6`。五附件由工作流核实后转正，公开完整下载与摘要复核通过；旧发布不变。

## 验证状态

- **通过**：T010 PR CI 与[主线 CI](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39631043773) 完整通过，含两个 helper 和 Electron；T011 v0.5.4 工作区本地构建／类型与 223 单测通过。
- **通过**：[T011 PR CI #38](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39632121271) 全部通过。本地 NSIS／portable 打包、五资源校验、asar 运行依赖／内置完成音效检查通过；发布提交树与已验证 PR 一致。
- **通过**：[Release #13](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39632962647) 与[发布主线 CI #39](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39632936724) 全部成功。五附件已自动校验后发布，正式 latest 已确认；公开 Portable HEAD／校验文件 GET 与元数据一致。
- **通过**：五附件公开 GET 200／完整下载／大小／SHA-256 与 GitHub 元数据一致，SHA256SUMS 及 latest.yml 的版本、文件名、大小、SHA-512 交叉核实通过；远程标签指向一致。摘要与证据位置见 T011。
- **保留限制**：T010 本地完整 Electron 一轮 15/16，原生鼠标偏移 26px、容差 1px；原样单独重试通过，未解决根因。更早失败／恢复记录见 T010／T009，不用新的通过结果抹除。
- **未运行**：真实账户与真实 DSH／Work 端到端、真实用户数据覆盖升级、WSL／远程／其他 DSH 格式。本次不改更新器实现，不重复独立两版本升级实验；隔离测试不代替真实试用。

## 兼容与发布约定

appId、数据目录 `%APPDATA%\DesktopPlay`、安装版与 portable 共用数据约定保持不变。新设置迁移旧时长、短句、文案和共享开关，严格校验并原子保存；不保证旧二进制降级读取新字段。DSH 默认监听开启，完成声音默认关闭。自定义 GPT 共用原版档案。

v0.5.3 用户可在软件内更新；更早版本可直接手动覆盖升级，无需卸载或删除数据。既有 v0.5.3 发布核实及匿名源限流限制见 [T009](tasks/T009-release-v053.md)。本次只测试隔离数据，不拿真实桌宠做升级实验。

## 下一步

发布已完成，不重跑或覆盖 v0.5.4。后续可补真实客户端与真实数据验证、既有草稿上传恢复路径实测；新独立任务下一编号 T012／R017。
