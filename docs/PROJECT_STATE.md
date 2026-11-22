# DesktopPet 当前项目状态

更新日期：2026-11-22（Asia/Shanghai）。入口：[协作指南](../AGENTS.md)、[需求登记](REQUIREMENTS.md)、[界面设计](../DESIGN.md)。

## 当前任务

- [T035／R041](tasks/T035-ui-foundation.md)（2026-11-22，`feat/T035-settings-foundation`，基准 `b07b82e`，**未提交，待审查**）已实现六项导航、共享视觉变量、DOM 组件和草稿保存／放弃。首页提供快捷入口。类型检查、构建、322 项单测、19 项 Electron 冒烟及两个尺寸的截图核对通过。[T036 首页总览](tasks/T036-home-overview.md) 将从 T035 分支的结果提交创建独立分支，审查与合入按任务顺序执行。
- [T034／R041／R042](tasks/T034-ui-redesign-plan.md) 规划已在原分支本地提交 `b07b82e`，基准为远端 `main` 的 `0d20d93`。规格、原型与未开始阶段见 [UI_REDESIGN.md](UI_REDESIGN.md) 和 [T034 原型](previews/T034/ui-mockup.html)。
- [T033／R040](tasks/T033-release-v210.md) 已发布 [v2.1.0](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v2.1.0)。[PR #38](https://github.com/Forest-Wood/DesktopPlay/pull/38) 合入主线，标签 `v2.1.0` 指向 `07f774b`。[发布工作流 44549546635](https://github.com/Forest-Wood/DesktopPlay/actions/runs/44549546635) 通过单测、Windows x64 打包、更新运行时与全部六项附件摘要（含 NSIS 与免安装版 `.blockmap`）及公告校验。
- [T032／R039](tasks/T032-incremental-update.md) 已通过 [PR #37](https://github.com/Forest-Wood/DesktopPlay/pull/37) 合入主线 `5b6f13a`，随 v2.1.0 分发：实现 NSIS（`electron-updater` `.blockmap`）与 Portable（流式 Rabin CDC + `64 KiB` Range 合并 + 本地 `programPath` 扫描 + 完整 SHA-256 校验）增量／差分更新、自动回退整包、增量进度与回退 ETA 重置及 6 项 Release 资产校验；并在 `AGENTS.md` 补充前序未提交任务先原分支本地提交再切新分支的隔离规则。
- [T031／R038](tasks/T031-prune-overdefensive-tests.md) 已通过 [PR #36](https://github.com/Forest-Wood/DesktopPlay/pull/36) 合入主线 `9adeb77`：精简 `tests/` 中过度防御与跨层重复测试，将 `update-helper-fixtures.ps1` 的 2 分钟等待超时改为 `-IncludeSlowTimeout` 显式开关，并将“避免过度防御性测试”原则写入 `AGENTS.md` 与 PR 模板。
- [T030／R037](tasks/T030-release-v202.md) 已发布 [v2.0.2](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v2.0.2)。[PR #34](https://github.com/Forest-Wood/DesktopPlay/pull/34) 合入主线，标签 `v2.0.2` 指向 `b36bbc6`。[发布工作流 44531740265](https://github.com/Forest-Wood/DesktopPlay/actions/runs/44531740265) 通过单测、Windows x64 打包、更新运行时与五项附件摘要及公告校验。
- [T029／R036](tasks/T029-update-eta-gemini-completion.md) 已通过 [PR #33](https://github.com/Forest-Wood/DesktopPlay/pull/33) 合入主线 `d7c32c2`，随 v2.0.2 分发。应用内软件更新下载新增平滑速率与预计剩余时间估计；修复 Gemini 任务完成提示气泡在 VS Code 与桌面 App 均未展示的问题；在协作文档新增完成 `T(N)` 清理 `T(N-2)` 临时测试文件的滚动规范。真实 VS Code／App 端完成弹泡待实机验收。
- [T028／R035](tasks/T028-release-v201.md) 已发布 [v2.0.1](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v2.0.1)。[PR #31](https://github.com/Forest-Wood/DesktopPlay/pull/31) 合入主线，标签 `v2.0.1` 指向 `9679547`。[发布工作流 44507457122](https://github.com/Forest-Wood/DesktopPlay/actions/runs/44507457122) 通过打包、更新运行时与五项附件摘要及公告校验。
- [T027／R034](tasks/T027-retention-bubble.md) 已通过 [PR #30](https://github.com/Forest-Wood/DesktopPlay/pull/30) 合入主线 `903dd9e`，随 v2.0.1 修复在“用量小报告”或“陪伴短句”气泡页点击“换角色”时挽留提示词拼接在原页面文案后面的问题。
- [T026／R033](tasks/T026-gemini-ui.md) 已通过 [PR #29](https://github.com/Forest-Wood/DesktopPlay/pull/29) 合入主线 `c101c7e`，随 v2.0.1 提供 Gemini 气泡双列排版、设置页三栏额度卡与状态胶囊、星光紫角色舞台（`gemini-theme`）、三角色并排选择器与左右对称翻转后的经典／手绘两款造型。
- [T025／R032](tasks/T025-release-v200.md) 已发布 v2.0.0。[PR #27](https://github.com/Forest-Wood/DesktopPlay/pull/27) 合入主线，标签指向 `163a87a`。构建、324 项单测、27 项 Electron 测试及两套文件助手验证通过。
- [T024／R031](tasks/T024-gemini-pet.md) 已经 [PR #26](https://github.com/Forest-Wood/DesktopPlay/pull/26) 合并，随 v2.0.0 提供 Gemini 的两款造型、三项额度与对话提醒。真实 App 与 agy 的额度已按三项对照，真实三端任务提醒和共享池账户仍待验收。

## 主线与发布

- [v2.1.0](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v2.1.0) 于 2026-11-19 23:00:40（Asia/Shanghai）成为最新正式版。[发布工作流](https://github.com/Forest-Wood/DesktopPlay/actions/runs/44549546635) 校验了六个附件（含免安装版 `.blockmap`）和更新公告。
- T031 与 T032 随 v2.1.0 分发；T029 随 [v2.0.2](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v2.0.2) 分发；T026 与 T027 随 [v2.0.1](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v2.0.1) 分发；T021 至 T024 随 [v2.0.0](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v2.0.0) 分发。此前 v1.1.0 的发布记录见 [T020](tasks/T020-release-v110.md)。

## 有效限制与后续

- 临时文件按 `T(N-2)` 规则清理。T035 已清理 T033 的三份非跟踪临时草稿，见当前任务记录。既有视觉证据见 T022／T023 交接。

- 2026-11-12 GPT 额度只读排查（工作区 HEAD `cc318be`，保留全部既有 T022 未提交修改）：运行中安装版为 `D:\DesktopPet` v1.1.0，进程启动于 11-09，现存 VS Code Codex 扩展目录创建于 11-11。通过当前 `codex-quota.ts` 的发现及只读请求函数实测额度读取、解析成功，未记录账户身份或凭据。安装包代码与源代码均只在初始化发现程序，刷新失败不重新发现；旧扩展路径失效为高概率原因，未直接读取运行中缓存路径。建议完全退出并重开桌宠验证；尚未重启、未确认 UI 恢复、未修改业务代码或真实配置。诊断临时构建已在后续目录复核时确认不存在。若后续修复自动重新发现，另建任务分支；本次仅新增此排查记录，不归入 T022 实现结果。

- DeepSeek 内置已核实的 2026 假期；后续年份涉及假期的时段和切换时间待核实。峰谷只描述模型调用收费时段，不拆分历史消费；账本兼容和分段规则见 DESIGN。
- [T015](tasks/T015-gpt-attention.md)／[T017](tasks/T017-hook-diagnosis.md)：真实 ChatGPT／VS Code 完整 GUI 矩阵及重新加载会话后的 hook 恢复仍待用户环境验收。隔离协议验证不替代真实客户端验收。
- 原生鼠标间歇偏移仍无根因结论，见 T010／T014／T022；T022 当前实现及基准对照均复现按住时位置偏移，不能用早期单次通过认定已解决。
- 受限 Electron 存在启动超时／AppContainer 环境限制；隔离测试可在沙箱外运行，保持应用 Electron 沙箱启用。测试不得使用真实账户、账本或修改真实客户端设置。
- appId、`%APPDATA%\DesktopPlay` 及安装／portable 共用数据保持兼容。等待与完成提示默认点击前常驻，可按场景设置定时关闭，隐藏／退出清空，不补历史。
- 下一独立任务编号：T042／R043（T035–T041 已预留给 R041／R042 的实现与收尾）。
