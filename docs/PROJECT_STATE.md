# DesktopPet 当前项目状态

更新日期：2026-11-19（Asia/Shanghai）。入口：[协作指南](../AGENTS.md)、[需求登记](REQUIREMENTS.md)、[界面设计](../DESIGN.md)。

## 当前任务

- [T026／R033](tasks/T026-gemini-ui.md)（分支 `feat/T026-gemini-ui`，目标 `main`）：优化 Gemini 气泡双列排版、设置页三栏额度卡与状态胶囊、星光紫角色舞台（`gemini-theme`）、三角色并排选择器与提醒／关于文案，并将经典与手绘两张内置 PNG 无损左右对称翻转（同步 `classic` 非透明起点 `x: 1`）。`npm.cmd run build`、22 项相关单测、`gemini.spec.ts` 隔离 Electron 测试及截图核验、`git diff --check` 均通过，已提交推送并创建 PR 待审阅。
- [T025／R032](tasks/T025-release-v200.md) 已发布 v2.0.0。[PR #27](https://github.com/Forest-Wood/DesktopPlay/pull/27) 合入主线，标签指向 `163a87a`。构建、324 项单测、27 项 Electron 测试及两套文件助手验证通过。
- [T024／R031](tasks/T024-gemini-pet.md) 已经 [PR #26](https://github.com/Forest-Wood/DesktopPlay/pull/26) 合并，随 v2.0.0 提供 Gemini 的两款造型、三项额度与对话提醒。真实 App 与 agy 的额度已按三项对照，真实三端任务提醒和共享池账户仍待验收。

## 主线与发布

- [v2.0.0](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v2.0.0) 于 2026-11-19 16:58:27（Asia/Shanghai）成为最新正式版。[发布工作流](https://github.com/Forest-Wood/DesktopPlay/actions/runs/44491940594) 校验了五个附件和更新公告。
- T021 至 T024 均随 v2.0.0 分发。此前 v1.1.0 的发布记录见 [T020](tasks/T020-release-v110.md)，本地 `release/` 仍保留该历史版本。

## 有效限制与后续

- 清理记录和既有视觉测试证据见 T022／T023 交接。T024 隔离测试目录在 `.tmp/T024-*`。

- 2026-11-12 GPT 额度只读排查（工作区 HEAD `cc318be`，保留全部既有 T022 未提交修改）：运行中安装版为 `D:\DesktopPet` v1.1.0，进程启动于 11-09，现存 VS Code Codex 扩展目录创建于 11-11。通过当前 `codex-quota.ts` 的发现及只读请求函数实测额度读取、解析成功，未记录账户身份或凭据。安装包代码与源代码均只在初始化发现程序，刷新失败不重新发现；旧扩展路径失效为高概率原因，未直接读取运行中缓存路径。建议完全退出并重开桌宠验证；尚未重启、未确认 UI 恢复、未修改业务代码或真实配置。诊断临时构建已在后续目录复核时确认不存在。若后续修复自动重新发现，另建任务分支；本次仅新增此排查记录，不归入 T022 实现结果。

- DeepSeek 内置已核实的 2026 假期；后续年份涉及假期的时段和切换时间待核实。峰谷只描述模型调用收费时段，不拆分历史消费；账本兼容和分段规则见 DESIGN。
- [T015](tasks/T015-gpt-attention.md)／[T017](tasks/T017-hook-diagnosis.md)：真实 ChatGPT／VS Code 完整 GUI 矩阵及重新加载会话后的 hook 恢复仍待用户环境验收。隔离协议验证不替代真实客户端验收。
- 原生鼠标间歇偏移仍无根因结论，见 T010／T014／T022；T022 当前实现及基准对照均复现按住时位置偏移，不能用早期单次通过认定已解决。
- 受限 Electron 存在启动超时／AppContainer 环境限制；隔离测试可在沙箱外运行，保持应用 Electron 沙箱启用。测试不得使用真实账户、账本或修改真实客户端设置。
- appId、`%APPDATA%\DesktopPlay` 及安装／portable 共用数据保持兼容。等待与完成提示默认点击前常驻，可按场景设置定时关闭，隐藏／退出清空，不补历史。
- 下一独立任务编号 T027／R034。
