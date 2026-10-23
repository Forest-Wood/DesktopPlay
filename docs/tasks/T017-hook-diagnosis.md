# T017：接入 hook 后提问卡片未提醒的诊断

- 日期：2026-10-23（Asia/Shanghai）；负责人：Codex；关联既有需求：R023，不新增产品需求。
- 目标：解释用户在 VS Code 插件和 App 内 Codex 中只收到完成提醒、未收到提问提醒的现象，核实接入与运行时差异。
- 范围：只读检查接入、启用、信任、宿主及匿名事件元数据；隔离原生运行时复现；记录恢复步骤和仍待验收事项。
- 最终目标合并分支：main；PR 直接基线：`release/T016-v101`，依赖发布交接 PR #19，避免重复包含它的五份文档；#19 合并后将本 PR 的基线改为 main。工作目录：`D:\desktop1\DesktopPlay`；分支：`docs/T017-hook-diagnosis`。
- 基准：`5e4a898b39bd5fa7e99274dcb2b8920b96c78120`，包含 T016 已发布交接记录；2026-10-23 fetch 核实远程 main 为 `7755edc48751c6ca02afd53fd6828e134212f437`，交接 PR #19 尚未合并。
- 开始诊断时工作区干净；创建 PR 时带入的两份未提交文档均为本任务已有产出。诊断记录提交：`9ed8427fe3b055ca5769ef7f2305c42e56c0c29f`；PR 交接更新见分支后续历史。仅本记录和 `docs/PROJECT_STATE.md`，不修改应用、版本、真实设置或客户端信任。
- 状态：[PR #20](https://github.com/Forest-Wood/DesktopPlay/pull/20) 已创建，待审查；诊断已复现，真实客户端恢复待用户重启后验证。2026-10-23 用户授权提交、推送并创建 PR，不包含合并或发布。

## 已确认事实

- 运行中的桌宠为 v1.0.1；等待提醒和 hook 接入均开启；默认主目录已有 PreToolUse、PermissionRequest 两项；两项信任哈希和 enabled=true 已保存。不能继续归因为用户没有开启或信任。
- hook 收件目录 active 租约持续更新，提醒规则开启。完成提醒使用另一条监听链路，完成气泡出现不能证明提问 hook 已运行。
- 当前 App、VS Code 的 Codex 后台引擎启动于 10 月 21／22 日，早于 10 月 23 日接入；最近插件及 App 的提问工具名称为 request_user_input_async。真实调查只保留时间、来源、工具名和字段形状，不保存账户、会话标识或正文。
- App 当日日志未发现原生提问／权限 forward show 事件；这不能证明通知偏好关闭。App 仍按 R023 的会话可见性规则处理，正在查看同一会话时不重复提醒。

## 隔离验证

所有原生运行时探针使用 .tmp 下独立 CODEX_HOME、虚构标识、回环合成模型；无登录、真实会话写入或付费推理。信任绕过仅用于隔离 fixture，不改真实信任。

- **通过**：重新执行 `node tests/hook-runtime.mjs`，IDE 捆绑原生程序 0.162.0-alpha.17.2 的同步提问、审批、未信任保留原提问、转发停用保留原审批四场景通过；证据目录 `.tmp/t013-runtime path-$'-3YBhmg`。
- **复现**：`.tmp/T017-hook-late-install-probe.mjs` 先启动引擎并创建会话，再安装 hook；原提问请求正常出现，但无 hook 转发，20 秒观察结束 relay=false；证据目录 `.tmp/t013-runtime path-$'-2z8fJ5`。这是刻意制造的旧会话配置情形，不是原问题已修复的证据。
- **通过**：`.tmp/T017-hook-refresh-probe.mjs` 在同一隔离引擎中先创建旧会话再安装 hook，旧会话提问保留且无转发；随后新建会话，提问转发成功；证据目录 `.tmp/t013-runtime path-$'-JLf9H2`。证明会话持有的配置可能早于后续接入，仅关闭卡片或返回同一会话不能保证刷新。
- **通过但有限**：`.tmp/T017-async-dynamic-probe.mjs` 显式注册同名动态工具后，异步名称能匹配现有 hook 并转发；证据目录 `.tmp/t013-runtime path-$'-BNToIj`。这只验证注册动态工具的链路，不能替代真实客户端的异步提问卡片验收。
- **探针不适用**：未注册异步工具的普通探针、send_message_to_user_async 和 default_mode_request_user_input 特性探针均返回 unsupported call: request_user_input_async；没有复现真实客户端的完整异步工具环境。不能据此断言真实客户端不支持该工具，也不能把“异步”直接认定为根因。
- **环境限制与恢复**：受限进程查询无法读取程序路径，提权后只查询进程名称、路径、父进程和启动时间成功；未读取命令行、窗口标题或账户。未修改 ACL 或客户端进程。
- **未运行**：真实 VS Code／App 完全退出、重启后的同步／异步卡片；App 当前会话、其他会话、后台／最小化通知矩阵。因此当前只能确认一个与反馈一致且可复现的配置缓存原因，不能声称两个客户端已恢复。
- **文档检查通过**：严格 UTF-8、本地链接、`git diff --cached --check`、两文件暂存范围，以及下方复现代码的 Node.js 语法和原 fixture 三处替换位置检查。纯文档变更未重复运行类型检查、构建或全量应用测试。

旧／新会话对照探针可从仓库现有 fixture 重建。在仓库根先运行下面的 Node.js 代码生成忽略目录内的探针，再设置 `DESKTOPPLAY_HOOK_TEST_CODEX` 为待验证的本机 Codex 可执行文件，执行 `node .tmp/T017-hook-refresh-probe.mjs`：

```javascript
const fs = require('node:fs');
const probe = fs.readFileSync('tests/hook-runtime.mjs', 'utf8')
  .replace('await observer.configure(true, home);', '// Delay installation until the first thread exists.')
  .replace("['untrusted', 'question', 'approval', 'relay-failure']", "['untrusted', 'question']")
  .replace("await rpc('turn/start', { threadId:", "await observer.configure(true, home); await rpc('turn/start', { threadId:");
fs.mkdirSync('.tmp', { recursive: true });
fs.writeFileSync('.tmp/T017-hook-refresh-probe.mjs', probe);
```

探针沿用原 fixture 的 `untrusted` 输出标签；此对照第一阶段实际是创建会话时尚无 hook，不能用该标签认定用户的信任状态有问题。第二阶段在同一引擎内新建会话，预期出现 `question: relay=true`。测试只验证引擎配置刷新，不包含真实客户端异步卡片或桌宠 GUI。

## 恢复与后续

1. 保存工作后完全退出所有 VS Code 窗口，再重新启动，以重新加载插件的后台 Codex；已有会话可在重启后重新进入，避免只收起／重新打开卡片。
2. App 从托盘菜单退出并重新启动；不要仅关闭到托盘或最小化。该入口使用原生通知，仍需开启提问／权限通知。
3. 触发新的真实卡片。VS Code 不要求切后台；App 应切到其他会话或后台后再产生新卡片。收到事件时间和气泡都需核实。
4. 若完全重启后仍失败，再针对真实异步工具路径继续定位；不要反复安装、代为信任或以模拟事件声称已恢复。后续接入界面应明确区分“启用并信任”与“实际事件已验证”，提示旧会话配置缓存及完全重启步骤。

创建 PR 时 GitHub 连接器返回 403（集成缺少写权限），改用本机已有 Git 凭据在内存中调用 GitHub 官方 API 成功创建 #20；未输出或保存凭据。PR 直接基于 `release/T016-v101`，当前只显示上述两份 T017 文档；依赖 #19 先合并，之后将 #20 基线改为 main。未合并、未发布。

本次仅留下诊断记录；没有发布修复包。官方依据：[hook 信任与运行边界](https://learn.chatgpt.com/docs/hooks)。
