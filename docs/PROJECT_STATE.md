# DesktopPet 当前项目状态

更新日期：2026-11-19（Asia/Shanghai）。入口：[协作指南](../AGENTS.md)、[需求登记](REQUIREMENTS.md)、[界面设计](../DESIGN.md)。

## 当前任务

- [T024／R031](tasks/T024-gemini-pet.md) 新增 Gemini 两款造型、三个额度窗口和 Antigravity 完成、提问及审批提醒。实现提交 `eae4eb4` 已推送至 `feat/T024-gemini-pet`，[PR #26](https://github.com/Forest-Wood/DesktopPlay/pull/26) 目标为 `main`，待审阅。2026-11-19 已核实远程主线仍为 `90a67b3`。
- 构建、324 项单测及 6 项定向隔离 Electron 测试通过。真实 App 与 agy 的额度已按三项对照；真实三端任务提醒和共享池账户仍待验收。当前版本 1.1.0。

## 主线与发布

- 2026-11-18 fetch 得到 main `90a67b3`。T022／T023 已随 [PR #25](https://github.com/Forest-Wood/DesktopPlay/pull/25) 合并。其既有验收限制见 [T022](tasks/T022-companion-ui.md) 和 [T023](tasks/T023-notice-dismiss.md)。
- [v1.1.0](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v1.1.0) 已于 **2026-10-27 00:35:55（Asia/Shanghai）**正式发布；`gh release view` 确认非草稿、非预发布，标签对象 `9530c9d36dc394c5450b7d8ca23ef84970d95744`。本次保留版本 1.1.0，没有新发布。
- [T020](tasks/T020-release-v110.md) 准备提交 `f0abbbc`，经 PR #23 合并为 `18b3879`。[T019](tasks/T019-pet-mode-local-time.md) 的全局模式、账本本地时间和设置页峰谷已合并并随 v1.1.0 发布。
- T021 清理后本地 `release/` 保留 v1.1.0 的安装版、免安装版、blockmap、latest.yml 和 SHA256SUMS.txt，并核实摘要、更新清单与公告一致。T022 未改动或重新核验这些文件；它们不包含后续 T021／T022 修改。

## 有效限制与后续

- 清理记录和既有视觉测试证据见 T022／T023 交接。T024 隔离测试目录在 `.tmp/T024-*`。

- 2026-11-12 GPT 额度只读排查（工作区 HEAD `cc318be`，保留全部既有 T022 未提交修改）：运行中安装版为 `D:\DesktopPet` v1.1.0，进程启动于 11-09，现存 VS Code Codex 扩展目录创建于 11-11。通过当前 `codex-quota.ts` 的发现及只读请求函数实测额度读取、解析成功，未记录账户身份或凭据。安装包代码与源代码均只在初始化发现程序，刷新失败不重新发现；旧扩展路径失效为高概率原因，未直接读取运行中缓存路径。建议完全退出并重开桌宠验证；尚未重启、未确认 UI 恢复、未修改业务代码或真实配置。诊断临时构建已在后续目录复核时确认不存在。若后续修复自动重新发现，另建任务分支；本次仅新增此排查记录，不归入 T022 实现结果。

- DeepSeek 内置已核实的 2026 假期；后续年份涉及假期的时段和切换时间待核实。峰谷只描述模型调用收费时段，不拆分历史消费；账本兼容和分段规则见 DESIGN。
- [T015](tasks/T015-gpt-attention.md)／[T017](tasks/T017-hook-diagnosis.md)：真实 ChatGPT／VS Code 完整 GUI 矩阵及重新加载会话后的 hook 恢复仍待用户环境验收。隔离协议验证不替代真实客户端验收。
- 原生鼠标间歇偏移仍无根因结论，见 T010／T014／T022；T022 当前实现及基准对照均复现按住时位置偏移，不能用早期单次通过认定已解决。
- 受限 Electron 存在启动超时／AppContainer 环境限制；隔离测试可在沙箱外运行，保持应用 Electron 沙箱启用。测试不得使用真实账户、账本或修改真实客户端设置。
- appId、`%APPDATA%\DesktopPlay` 及安装／portable 共用数据保持兼容。等待与完成提示默认点击前常驻，可按场景设置定时关闭，隐藏／退出清空，不补历史。
- 下一独立任务编号 T025／R032。
