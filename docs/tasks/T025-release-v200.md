# T025 · 发布 DesktopPet v2.0.0

2026-11-19，负责人 Codex，关联 R032。工作目录 `D:\desktop1\DesktopPlay`，分支 `release/T025-v200`，目标 main。基准为合并 Gemini PR #26 的 `6697f95`，开始时工作区干净。用户明确指定主版本升级并正式发布，按项目规则从最新正式版 v1.1.0 升为 v2.0.0。

版本准备同步 package、lock、APP_VERSION、release-plan 和中文公告。主线 CI 44489282883 有 5 项清理测试因为临时根目录未规范化失败；测试改用新建目录的 realpath，沿用原有断言和生产清理边界。

验收包括准备分支 CI、合入 main、稳定标签、发布流程检查及公开 latest 的五项附件和公告核对。上一阶段的真实三端提醒与共享池账户验收限制见 [T024](T024-gemini-pet.md)。发布准备阶段已通过 release:check，结果提交及正式发布时间在完成后登记。

准备提交 `339a187` 的 [PR #27](https://github.com/Forest-Wood/DesktopPlay/pull/27) 首轮 Windows CI 通过 324 项单测、两套文件助手测试和构建。27 项 Electron 测试中 4 项失败。已修复切换角色清空待展示通知的问题，保留使用新角色规则的有效气泡，并更新提问抢占顺序、Gemini 标签和提醒来源的断言。重新构建及重跑上述 4 项均通过。本机另测长按时首次观察到 17 像素偏移，原测试复跑通过，该用例在首轮 Windows CI 也通过。
