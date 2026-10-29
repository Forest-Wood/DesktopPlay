# DesktopPet 当前项目状态

更新日期：2026-10-30（Asia/Shanghai）。入口：[协作指南](../AGENTS.md)、[需求登记](REQUIREMENTS.md)、[架构设计](../DESIGN.md)。

## 当前任务

- [T021：小鲸鱼峰谷气泡与项目整理](tasks/T021-whale-period-cleanup.md)，需求 R028，实现 `585e5a2` 已提交并推送，[PR #24](https://github.com/Forest-Wood/DesktopPlay/pull/24) 待审查、未合并。分支 `feat/T021-whale-period-cleanup`，基准 main `18b3879`；开始时工作区干净，修改均为本任务。
- 完整模式用量页显示当前模型 API 峰谷和下次切换的本地时间；简洁模式不显示。复用官方时段与已核实假期，未知范围提示待核实，无新增 IPC 或持久化结构。
- 整理测试截图输出与文档，新增白名单清理命令。旧产物净清理 2,548,770,341 字节（约 2.37 GiB），保留 v1.1.0 五个分发文件、manual-profile 和仍有诊断用途的探针。最新验证与过程限制见 T021。
- 验证通过：全量 317 单测；最终文案后针对性 29 单测、构建／类型检查、相关隔离 Electron 8/8；实际 clean、保留附件复核和截图检查。当前构建包含 T021，现有安装包仍为原 v1.1.0。

## 主线与发布

- 本次通过只读 `git ls-remote` 核实 main 为 `18b3879d6e24d629d0883115d0e8851c5725a6f0`，与本次基准一致。
- [v1.1.0](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v1.1.0) 已于 **2026-10-27 00:35:55（Asia/Shanghai）**正式发布；`gh release view` 确认非草稿、非预发布，标签对象 `9530c9d36dc394c5450b7d8ca23ef84970d95744`。本次保留版本 1.1.0，没有新发布。
- [T020](tasks/T020-release-v110.md) 准备提交 `f0abbbc`，经 PR #23 合并至上述 main。[T019](tasks/T019-pet-mode-local-time.md) 的全局模式、账本本地时间和设置页峰谷已合并并随 v1.1.0 发布。
- 本地 `release/` 仅保留 v1.1.0 的安装版、免安装版、blockmap、latest.yml 和 SHA256SUMS.txt；本次核实摘要、更新清单与公告一致。它们是已发布版本的原有文件，不含尚未发布的 T021 修改。

## 有效限制与后续

- DeepSeek 内置已核实的 2026 假期；后续年份涉及假期的时段和切换时间待核实。峰谷只描述模型调用收费时段，不拆分历史消费；账本兼容和分段规则见 DESIGN。
- [T015](tasks/T015-gpt-attention.md)／[T017](tasks/T017-hook-diagnosis.md)：真实 ChatGPT／VS Code 完整 GUI 矩阵及重新加载会话后的 hook 恢复仍待用户环境验收。隔离协议验证不替代真实客户端验收。
- 历史本地原生鼠标间歇偏移尚无根因结论，见 T010／T014；后续一次通过不能视作根因已解决。
- 受限 Electron 存在启动超时／AppContainer 环境限制；隔离测试可在沙箱外运行，保持应用 Electron 沙箱启用。测试不得使用真实账户、账本或修改真实客户端设置。
- appId、`%APPDATA%\DesktopPlay` 及安装／portable 共用数据保持兼容。等待与完成提示点击前常驻，隐藏／退出清空，不补历史。
- T021 等待 PR #24 审查与 CI，后续合并／发布按授权执行；不重跑或覆盖已有标签。下一独立任务编号 T022／R029。
