# DesktopPet 当前项目状态

更新日期：2026-10-21（Asia/Shanghai）。入口见 [AGENTS.md](../AGENTS.md)、[需求登记](REQUIREMENTS.md)。代码和实际验证用于核实，发布历史详见各任务记录。

## 当前工作

- [T010：DSH 完成提醒与气泡差异化设置](tasks/T010-persona-notifications.md) 已实现、完成本地验证并推送，已创建 [PR #10](https://github.com/Forest-Wood/DesktopPlay/pull/10)，待审查，未合并／发布。
- 工作目录 `D:\desktop1\DesktopPlay`，分支 `feat/T010-persona-notifications`，目标 main，基准 `35dc22e`，实现提交 `f09bba4`。开始时干净，无带入的未提交修改。
- 交付前提权 `git fetch origin main` 成功，远程 main 仍为 `35dc22e`，无需同步主线或解决冲突；T010 新分支推送成功。早先连接失败和 TLS unexpected EOF 已恢复；插件创建 PR 返回 403，改用本机 Git 认证调用官方 API 创建成功。
- 三桌宠档案覆盖十类气泡、三来源独立文案及完成音效，基础样式和分类覆盖、实际渲染预览、配置迁移已接入。自定义 GPT 共用原版档案。
- DSH 只读 v4 普通／Zstandard 日志；默认 DSH_HOME/sessions，否则 ~/.dsh/sessions，提供目录选择、状态和开关。Codex、Work、DSH 独立开关，音效默认关闭，气泡和声音分别开关；隐藏丢弃、来源队列及退出排空已接入。
- 版本仍为 0.5.3；本地构建包含 T010，但已发布 v0.5.3 不含这些功能。预览图在 [T010 预览目录](previews/T010/bubble-editor.png)。

## 验证状态

- **通过**：最终 `npm.cmd run build`（含类型检查）、`npm.cmd test` 22 文件／223 单测；无新增依赖。
- **通过**：最后可见状态修复后的 Electron 4 文件／8 项（46.4 秒），验证 Work、Codex、DSH、三桌宠九组合、音效／仅声音、队列、草稿、真实渲染预览、持久化、隐藏余额不补弹、焦点及更新优先级。
- **失败／保留**：完整 Electron 一轮 15／16，原生鼠标按压横向偏移 26px，原断言 1px；单独复测 1／1 通过，未改断言或几何实现，不宣称根因已解决。前一轮 13／16 的旧字段／预览定位及退出收尾问题已修复复验，详情见 T010。
- **失败后恢复**：早先单测发布脚本超时、卸载 fixture 空 ack；相关文件单独与最终全量通过，未改其生产代码、断言或超时。
- **环境**：离线缓存安装依赖；下载 Electron 和隔离 smoke 使用提权环境，应用沙箱保持启用。受限启动 ACL 错误、中文编码修复及早先退出超时均留在 T010。
- **通过**：最大字号／200 字符长文案／倒挂截图目视检查；差异、文档链接、UTF-8 文案和 `git diff --check`。旧版本测试生成图已还原，只保留任务预览。
- **未运行**：真实用户数据／账户、真实 DSH／Work 端到端、打包／安装／卸载、其他 DSH 格式、WSL／远程。不以隔离测试代替真实试用。

## 发布基准与兼容性

此前发布交接确认 [v0.5.3](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v0.5.3) 于 2026-10-20 正式发布，标签源码 `e71d836`，五附件校验通过；自动恢复上传路径尚未实测、匿名 API 限流等限制见 [T009](tasks/T009-release-v053.md)。本次未改标签或 Release，未重查远程发布状态。

appId、产品数据目录 `%APPDATA%\DesktopPlay`、安装版／portable 共用数据约定不变。新设置补齐默认并迁移旧文案、短句、全局时长与共享开关，原子拒绝非法输入；保留旧 API 字段，但不保证旧二进制降级读取新字段。测试数据全部隔离；不得用真实桌宠做升级或通知测试。

## 下一步

审查 [PR #10](https://github.com/Forest-Wood/DesktopPlay/pull/10) 并查看 GitHub CI 实际结果；本地验证记录不代表远程 CI 已通过。合并和发布仍待后续授权。新独立任务下一编号 T011／R016。已有发布恢复上传路径和真实客户端端到端验证仍待后续处理，具体历史见 T008／T009，不重跑或覆盖已公开 v0.5.3。
