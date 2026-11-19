# T024 · Gemini 桌宠与 Antigravity 接入

2026-11-18 实现，2026-11-19 提交交付，负责人 Codex，关联 R031。目标分支 main，工作目录 `D:\desktop1\DesktopPlay`，任务分支 `feat/T024-gemini-pet`。起始工作区干净，基准为远程 main `90a67b3`。实现提交 `eae4eb4` 包含本任务的 38 个文件，已推送并创建 [PR #26](https://github.com/Forest-Wood/DesktopPlay/pull/26)，待审阅。交付时复核了暂存差异并通过 `git diff --cached --check`，沿用下表开发阶段的验证记录。真实三端提醒待验收。

## 目标与实现

- 设置、托盘、右键菜单和气泡加入 Gemini。两张用户提供的透明 PNG 均为 1254 × 1254，保留原图。经典的非透明像素边界为 (0,9) 至 (1253,1254)，手绘为整幅画布；布局与点击区域共用同一套几何计算。外观独立持久化，两款共用 Gemini 的声音、短句和气泡。
- 简洁和完整模式均固定展示 Argon 周、Gemini 周和 Gemini 5 小时剩余；完整模式与设置页显示服务给出的本地重置时间。区分零、缺失和明确共享。切换角色、打开额度设置及手动操作可刷新。可见的用量页或当前 Gemini 桌宠按分钟刷新。
- 主进程读取 Antigravity 发布的 daemon 清单，校验回环监听端口的属主后请求 `RetrieveUserQuotaSummary` 并要求刷新。客户端退出或接口不可用时，尝试本机已登录的 `agy -p /usage --output-format json`。渲染层只收到额度和时间。失败保留本次运行内最后一次成功值。
- 完成提醒由设置页显式接入全局 `config/hooks.json` 的 `DesktopPet-Gemini` 条目。Stop 转发器要求 `model_stop`、`fullyIdle`，过滤错误及显式子任务并与本地主会话元数据核对。设置页关闭接入时只移除自己创建的条目。
- App、IDE 和 CLI 各自的 `conversation_summaries.db` 以只读方式打开，提问与审批从主会话摘要里的等待步骤和交互类型识别。消费端按会话、轮次、步骤及类型去重，沿用跨角色通知队列和等待优先级。不支持的结构或缺少客户端记录时在设置页提示。旧设置读取时为新增角色和来源补默认值。

## 验收与证据

| 检查 | T024 工作区结果 |
| --- | --- |
| `npm.cmd run build`，含 TypeScript、Vite、esbuild | 通过 |
| `npm.cmd test -- --reporter=dot` | 全量 29 个文件、324 项通过。首次构建和单测发现旧测试将角色或来源数量写死，已调整并保留原断言意图。新测试曾发现数据库文件的修改时间不足以区分连续写入，已移除该跳过条件。修正真实接口缓存请求及共享池说明解析后，最终构建和 5 项 Gemini 专项单测再次通过。 |
| `npx.cmd playwright test tests/smoke/gemini.spec.ts tests/smoke/gpt-attention.spec.ts --output=.tmp/T024-smoke-results`，软件渲染 | 四项通过。扩充 Gemini 的真实转发脚本和等待数据库 fixture 后，单独重跑 Gemini 也通过。核验两款原图、固定三行含零值、简洁气泡无纵向裁切、重启保留造型、跨角色提醒、正常结束去重和接入移除。三种客户端目录的提问及审批各有隔离单测。 |
| 既有桌宠回归 `desktop.spec.ts` 的 `packaged renderer`、`comic bubble pages` 两项 | 重试均通过。首次测试仍假定最后编辑的是白龙，且未区分气泡是否自动收起。已更新四角色断言和翻页初始条件。另修复气泡内跨人设换造型后按钮随气泡收起的问题，实际连续切换 GPT 原版、白龙通过。 |
| 本机 Antigravity 2.32.1、agy 1.5.9 的只读额度查询 | 桌面接口与 CLI 报告三项百分比一致，均有有效重置时间。首次使用默认请求返回缓存时间，曾相差 1250 秒。请求强制刷新后，连续两次查询历时 10 秒、三个重置时间各相差 9 秒。没有记录账户标识或完整响应。 |
| `git diff --check` 与素材边界、桌宠截图检查 | 通过。隔离界面预览保存在 `.tmp/T024-smoke-*/gemini-{classic,simple}.png`。 |

真实客户端的提问、审批、完成弹出，以及共享池账号的实机读数仍待人工验收。仅以隔离 profile 安装过测试 hook，没有改写真实 hook、结束正在使用的客户端、发起付费任务或执行真实审批。CLI 后端已独立实读；所有客户端均退出时的自动回退由隔离测试覆盖。未执行打包安装、发布或真实卸载。下一步为审阅工作区差异和使用目标客户端验收提醒。

接口参考见 [Google Hooks](https://antigravity.google/docs/hooks)、[Google 用量面板](https://www.antigravity.google/docs/cli/commands/usage/)、[CodexBar 的读取方式](https://github.com/steipete/CodexBar/blob/main/docs/antigravity.md) 和 [Windows 额度字段参考](https://github.com/JerryGong1002/antigravity-weekly-quota#data-source-and-compatibility)。
