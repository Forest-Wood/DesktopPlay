# T015：修复 GPT 系列询问提醒

- 日期：2026-10-23（Asia/Shanghai）；负责人：Codex；关联需求：R023，修正 R019。
- 目标合并分支：main；任务分支：`fix/T015-gpt-attention`；工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`236c594a005615df17b2eb61794726606e84bf9e`；结果提交：未提交。
- 开始时工作区干净，无带入修改。受限网络获取远程失败，提权 `git fetch origin main` 成功；远程 main 与上述基准一致。
- 状态：已实现，隔离验证通过，真实客户端 GUI 待验收。2026-10-23 用户授权提交、推送并创建 PR，正在办理；版本保持 1.0.0，尚未合并或发布。

## 目标与验收

修复 ChatGPT App 的聊天／Work／Codex 模式及 VS Code Codex 提问卡片、填写请求、审批弹窗不触发桌宠的问题。ChatGPT 沿用原生会话可见性过滤：当前会话正在查看时不重复提醒，其他会话或应用后台可提醒。用户最终确认 VS Code 有提问／审批就提醒，包含正在查看的会话。普通正文追问不纳入；DeepSeek 保持既有行为并回归。

接入默认仍关闭，用户显式开启并保存；原客户端审阅和信任不能由桌宠代为完成。区分未接入、等待真实事件、收到事件和错误，不以目录可读声称提醒验证完成。保留气泡常驻、点击关闭、不抢焦点、隐藏／关闭后不补历史及匿名 IPC。

## 实现与决定

- 本机设置只读核实：等待提醒开关开启，但 `codexHookEnabled=false`；两种已安装原生 Codex（IDE 0.162.0-alpha.17.2、App 0.163.0-alpha.11）均支持 hook。没有更改用户设置、真实 hooks.json、信任或通知偏好。
- 只读核实已安装桌面程序的通知构造代码：提问／审批 ID 中包含 host，异步提问为六段数组；已知 host 为 local、durable。旧解析器只接受 durable。最近日志没有提问／审批事件；这不能证明通知偏好关闭。
- App 三种模式统一使用原生 forward show 等待通知，增加 local 三种格式；保持 Work 完成提醒原有 durable 语义。异步事件身份包含 host、线程、轮次和 item，排除账户／用户字段，避免 host／轮次碰撞。
- hook 只读取宿主进程名称／父进程关系，附带 chatgpt／vscode／cli／unknown 的匿名客户端类别。App hook 不弹气泡，由原生通知独立处理；CLI／VS Code hook 不过滤焦点。未识别及旧版无 client 文件保持转发兼容。只读核实本机真实父进程：App 引擎直属 ChatGPT.exe，IDE 引擎直属 Code.exe。
- 现有状态增加可选 `lastAttentionAt`，缺省视为 null；配置／来源范围改变时重建基线并清除诊断。公共 ConversationNotice 和已有存储键不变，没有新增 IPC。选择新的原生程序后重新检查 hook 兼容性。
- 对话提醒页优先展示等待设置，按 App 与 CLI／VS Code 展示一次接入步骤、实际目录、未保存草稿、事件状态及时间。状态区不把“日志已连接”当成询问链路已验证。
- 新的 `DESKTOPPLAY_TEST_CODEX_HOOK_SUPPORTED=1` 仅在非打包且 `DESKTOPPLAY_TEST_NO_CODEX=1` 时模拟兼容性，供隔离 Electron 文件链路测试使用；生产不绕过兼容性或信任。

官方依据：[通知设置](https://learn.chatgpt.com/docs/notifications)、[hook 审阅与信任](https://learn.chatgpt.com/docs/hooks)。

## 验证记录

- **通过**：针对旧源码的内存复现：local 提问／审批／异步提问全部不识别，durable 全部识别；旧相关 19 项单测通过，证实缺少覆盖。
- **通过**：修改后相关三文件 33 单测；全量 `npm.cmd test`：25 文件／266 项通过。覆盖 local／durable 三种格式、错误格式、身份去重、轮转、开关基线、最近事件状态、来源分类、静默转发及 DeepSeek 普通／压缩来源。
- **通过**：`npm.cmd run build`，含类型检查；`git diff --check`。
- **通过**：`DESKTOPPLAY_HOOK_TEST_CODEX=<IDE 原生程序>` 后执行 `node tests/hook-runtime.mjs`，隔离 CODEX_HOME、回环合成模型，无登录／付费推理。四场景：未信任 hook 被跳过但原提问出现；提问、审批转发；转发停用后原审批仍出现。证据 `.tmp/t013-runtime path-$'-LvKU3w/evidence.json`。受信任链路使用仅限 fixture 的逐线程信任绕过，不改变真实信任。
- **失败后修复**：新增测试函数缺少结束花括号导致初轮解析／类型检查失败；补齐后通过。PowerShell 模块首次加载进度写入 CLIXML stderr，设置 ProgressPreference 为 SilentlyContinue 后静默断言通过。
- **环境失败**：受限 Electron 相关 11 项均因已有 AppContainer ACL 拒绝启动失败；不改 ACL，不关闭 Electron 沙箱，转到提权隔离环境原样重跑。受限 CIM 进程读取拒绝访问，提权只读核实祖先进程名称成功；没有读取命令行、标题、账号或聊天正文。
- **通过**：提权相关五文件共 11 个场景均已有通过结果：首轮 10/11，修正新增测试的渲染等待及异步配置移除等待后，新增两项最终 2/2（9.5 秒）通过。旧完成、常驻、角色文案／队列／音效、DeepSeek 压缩来源回归通过；新增覆盖六类 App 等待事件经真实监听到三桌宠、隐藏／来源开关、hook 文件静默转发与单来源路由、接入草稿／状态及配置移除。没有直接向渲染层注入新测试事件。
- **失败后修复**：新增 App 测试最初只等 IPC 计数和保留的 data-scenario 属性，未等 150ms 展示队列，提前点击隐藏气泡；补可见等待后通过。关闭接入时设置状态先于异步 hooks.json 清理完成，立即读文件断言偶发失败；改为等待实际文件清理完成后通过，未更改应用行为或放宽断言。
- **通过**：最后 `npm.cmd run build`（含类型检查）。两张隔离设置页截图已目视核验：`test-results/T015-app-attention-settings.png`、`test-results/T015-hook-connected-settings.png`，接入步骤、实际目录、最近事件及固定保存操作可读，内容独立滚动。
- **通过**：最终 16 个改动文本文件的严格 UTF-8 解码、三份交接文档的本地链接、版本字段仍为 1.0.0 及 `git diff --check`；工作区只包含本任务修改。
- **未运行**：真实账户与 ChatGPT 三模式的完整 GUI 提问／后台／最小化验收、完整 VS Code GUI、真实 DSH、打包／安装／覆盖升级及 WSL／远程。原生引擎协议和合成日志测试不等于这些真实场景验证。

## 下一步

实现与隔离验证已完成。2026-10-23 再次 fetch main 核实仍为基准 `236c594`，无需同步或解决冲突；按用户授权提交、推送并创建面向 main 的 PR。真实客户端待验收矩阵如下，未执行项不标为已验证；已有功能修复未来发布按 patch，普通开发不改版本。

| 客户端／场景 | 当前证据 | 真实 GUI 验收 |
| --- | --- | --- |
| ChatGPT 聊天 | local／durable 三格式解析、合成原生日志到气泡 | 当前会话／切换其他会话／后台／最小化均未运行 |
| ChatGPT Work | 同上，并通过原有 durable 结束通知回归 | 当前会话／切换其他会话／后台／最小化均未运行 |
| App 内 Codex | 同上；真实进程宿主为 ChatGPT.exe；App hook 不重复弹泡 | 当前会话／切换其他会话／后台／最小化均未运行 |
| VS Code Codex | 捆绑原生 app-server 四场景，真实宿主为 Code.exe；隔离 hook 文件到气泡 | 完整 IDE GUI 未运行；按用户最终选择不按会话可见性抑制 |

真实 GUI 验收需在用户自己的客户端开启原生通知或审阅信任 hook 后进行；本次没有替用户改变这些偏好。
