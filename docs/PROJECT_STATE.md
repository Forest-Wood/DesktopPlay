# DesktopPet 当前项目状态

更新日期：2026-11-12（Asia/Shanghai）。入口：[协作指南](../AGENTS.md)、[需求登记](REQUIREMENTS.md)、[界面设计](../DESIGN.md)。

## 当前任务

- T022／R029 与 T023／R030 已整合到 `D:\desktop1\DesktopPlay`、分支 `feat/T022-companion-ui`，目标 main。2026-11-12 fetch 核实 main 仍为 `cc318be`；按用户授权提交、推送并创建 PR，不合并、不发布。
- [T022](tasks/T022-companion-ui.md)：设置工作台及导航整理；[T023](tasks/T023-notice-dismiss.md)：分角色／来源／提醒类型关闭方式，以及提问优先显示。T023 原独立目录保留为快照，后续以本目录为准。
- 整合后验证通过：build（含类型检查）、17 相关单测、2 项隔离 Electron 交互、diff 检查。T022 先前 317 单测及视觉验证见任务记录，未在本轮重跑全量；鼠标按住偏移的既有失败和真实 VS Code 提问验收限制仍保留。
- 版本保持 1.1.0；未替换安装中的桌宠、未发布。结果提交与 PR 见任务记录。

## 主线与发布

- 2026-11-05 通过 `git ls-remote` 与 fetch 核实 main 为 `cc318beab5b92e59107983a5d8751b2511a83b98`，本次从该提交创建任务分支。[T021](tasks/T021-whale-period-cleanup.md) / [PR #24](https://github.com/Forest-Wood/DesktopPlay/pull/24) 已合并；其小鲸鱼峰谷、下次切换显示及清理工具均在基准内。
- [v1.1.0](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v1.1.0) 已于 **2026-10-27 00:35:55（Asia/Shanghai）**正式发布；`gh release view` 确认非草稿、非预发布，标签对象 `9530c9d36dc394c5450b7d8ca23ef84970d95744`。本次保留版本 1.1.0，没有新发布。
- [T020](tasks/T020-release-v110.md) 准备提交 `f0abbbc`，经 PR #23 合并为 `18b3879`。[T019](tasks/T019-pet-mode-local-time.md) 的全局模式、账本本地时间和设置页峰谷已合并并随 v1.1.0 发布。
- T021 清理后本地 `release/` 保留 v1.1.0 的安装版、免安装版、blockmap、latest.yml 和 SHA256SUMS.txt，并核实摘要、更新清单与公告一致。T022 未改动或重新核验这些文件；它们不包含后续 T021／T022 修改。

## 有效限制与后续

- 2026-11-12 清理复核：此前 `.tmp` 删除命令被工具策略拒绝，助手未执行删除；本次只读检查发现旧 smoke 目录、诊断脚本和 PR 文稿已不在目录中，现仅剩 `manual-profile` 与 `T022-visual.mjs`，共 7.92 MiB，外部清理方式未核实。`npm.cmd run clean -- --dry-run` 通过，无跳过项；候选为 `dist`、`dist-electron`、`test-results`，共 82 文件、12.38 MiB。当前 T022 尚待审阅，建议保留其截图及指针问题复现证据，不直接清空 `test-results`。`node_modules` 547.89 MiB、`release` 五项正式版资源 219.46 MiB，建议保留。本次未删除文件；保留既有 T022 修改，无业务代码变更、无提交。

- 2026-11-12 GPT 额度只读排查（工作区 HEAD `cc318be`，保留全部既有 T022 未提交修改）：运行中安装版为 `D:\DesktopPet` v1.1.0，进程启动于 11-09，现存 VS Code Codex 扩展目录创建于 11-11。通过当前 `codex-quota.ts` 的发现及只读请求函数实测额度读取、解析成功，未记录账户身份或凭据。安装包代码与源代码均只在初始化发现程序，刷新失败不重新发现；旧扩展路径失效为高概率原因，未直接读取运行中缓存路径。建议完全退出并重开桌宠验证；尚未重启、未确认 UI 恢复、未修改业务代码或真实配置。诊断临时构建已在后续目录复核时确认不存在。若后续修复自动重新发现，另建 T023 任务分支；本次仅新增此排查记录，不归入 T022 实现结果。

- DeepSeek 内置已核实的 2026 假期；后续年份涉及假期的时段和切换时间待核实。峰谷只描述模型调用收费时段，不拆分历史消费；账本兼容和分段规则见 DESIGN。
- [T015](tasks/T015-gpt-attention.md)／[T017](tasks/T017-hook-diagnosis.md)：真实 ChatGPT／VS Code 完整 GUI 矩阵及重新加载会话后的 hook 恢复仍待用户环境验收。隔离协议验证不替代真实客户端验收。
- 原生鼠标间歇偏移仍无根因结论，见 T010／T014／T022；T022 当前实现及基准对照均复现按住时位置偏移，不能用早期单次通过认定已解决。
- 受限 Electron 存在启动超时／AppContainer 环境限制；隔离测试可在沙箱外运行，保持应用 Electron 沙箱启用。测试不得使用真实账户、账本或修改真实客户端设置。
- appId、`%APPDATA%\DesktopPlay` 及安装／portable 共用数据保持兼容。等待与完成提示默认点击前常驻，可按场景设置定时关闭，隐藏／退出清空，不补历史。
- T022／T023 等待 PR 审阅；后续合并／发布按授权执行，不重跑或覆盖已有标签。下一独立任务编号 T024／R031。
