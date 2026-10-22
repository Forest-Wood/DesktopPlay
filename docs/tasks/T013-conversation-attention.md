# T013：常驻对话提醒与短句展示控制

- 日期：2026-10-22（Asia/Shanghai）；负责人：Codex；关联需求：R019–R021。
- 目标合并分支：main；工作目录：`D:\desktop1\DesktopPlay`；任务分支：`feat/T013-conversation-attention`。
- 基准提交：`f43b0154619b77145374a3c21fd49ecbdbc786a8`（PR #13 合并）；实现提交：`369344a3a1312d9496a67f61d3309f9fa522d1af`；已推送并创建 [PR #14](https://github.com/Forest-Wood/DesktopPlay/pull/14)，目标 main，非草稿；交接记录后续提交见分支历史。未合并／发布。
- 开始时工作区干净，无带入未提交修改。开始时在 T012 分支，受限网络 fetch 失败；提权 `git fetch origin main` 成功，取得最新 main 后建立任务分支。版本保持 0.5.4。
- 状态：已实现并本地验证，PR 待审查；实现无未提交修改。真实 Work／DSH 客户端及完整 IDE GUI 试用仍未运行。

## 实现与决定

- 新增统一 ConversationNotice 和白名单订阅；旧 onCodexCompletion 及完成频道保留兼容，旧订阅不接收等待事件。统一频道仅发送哈希标识、来源、类型和时间。
- Work 只读取已知 durable 原生 forward show：结束、question／approval 及六段 async-question ID；不把未知／被抑制通知推断成提问。DSH 复用 v4 帧、代次、主会话、继承及历史过滤，追加提问工具和审批记录；同批已经决定的审批不提示。
- Codex 接入默认关闭，通过现有保存按钮启用。支持检测使用所选／发现的 codex.exe 的只读 exec --help，不支持时显示 unavailable；收到首个实际事件前显示 starting。将独立 PowerShell 脚本写入应用数据 integrations/codex，增量合并目标主目录的 hooks.json，保留他人项、原文件备份、并发变化拒绝覆盖；禁用移除自己项。
- hook 只转发 PreToolUse 的 request_user_input／request_user_input_async 与 PermissionRequest。脚本无输出、失败退出 0；不返回 approval decision 或模型上下文。文件投递使用原子临时文件，只有应用持有新鲜租约时写入，旧文件启动丢弃；退出／更新暂停监听和租约。客户端需自行信任，生产代码不修改信任状态。
- 应用内确认卸载后移除自身 hook 配置，失败则保留程序并提示关闭接入后重试；更新保留配置。该路径只作类型／隔离服务验证，未实际卸载用户程序。
- hook 命令用 PowerShell EncodedCommand 包装单引号字面路径，避免路径空格、`$` 和引号被宿主 shell 展开；脚本本身可直接审查。模板替换用函数避免 JavaScript replacement 对 `$'` 的特殊解释。
- 等待与完成提醒保持到正文／现有关闭控件／气泡键盘 Enter、Space 确认。人物点击、悬浮、拖拽、状态广播及换造型不清除。当前项保持，待发等待优先；普通页面计时沿用。隐藏／退出清空，无跨进程未读存储。
- 新增 phraseDisplayByPersona 的 count／mode／selectedIndices，旧设置和旧气泡规则迁移。顺序批次只在实际查看短句时推进游标；随机同轮不重复，状态广播保持批次稳定。设置页使用原短句编辑器、候选勾选、数量与模式控件，草稿、非法保存及重启兼容。

## 验证及失败恢复

- **通过**：`npm.cmd test`，25 文件／262 单测；`npm.cmd run build`（包含类型检查）。新增解析、主进程迁移／持久化／原子拒绝、PowerShell 转发、配置增量安装／移除、不兼容状态、短句顺序／随机／零数量。
- **通过**：新 Electron 两项，覆盖三桌宠常驻、两分钟虚拟时间、人物点击、不抢焦点、切造型、优先级、隐藏清空及短句候选／草稿／拒绝不足／保存重启。截图在 `test-results/T013-*`，已目视检查。
- **通过**：修正后的相关 Electron 四文件 11/11（44.8 秒）；包括真实原生鼠标旧测试、Work 文件来源、九组合音效和 DSH 压缩日志。
- **通过**：最后完整 `npm.cmd run test:smoke` 18/18（1.2 分钟）；最后构建、差异与文档检查另见交付前工作区结果。
- **通过**：最后收紧设置描述符校验与增加卸载 hook 清理后，单测仍为 262/262，构建通过；针对常驻、配置持久化与更新生命周期的两文件 Electron 3/3（8.3 秒）通过。33 个相关文本文件的 UTF-8、文档相对链接及 git diff --check 通过；自动生成的旧版本预览图已恢复。
- **通过**：`DESKTOPPLAY_HOOK_TEST_CODEX=<原生 codex.exe>` 后运行 `node tests/hook-runtime.mjs`，实际 VS Code 扩展捆绑的 0.162.0-alpha.17.2 app-server，回环 HTTP 模型 fixture，提问／审批及转发不可用但原审批仍出现共三场景。最后路径含空格、美元符、单引号，证据 `.tmp/t013-runtime path-$'-65yczv/evidence.json`；只用虚构输入和隔离 CODEX_HOME，没有登录或付费推理。
- **通过**：`node tests/hook-runtime.mjs --cli` 搭配真实独立 CLI TUI（同版本、--no-daemon、隔离 CODEX_HOME、read-only），实际 /plan 提问、选择回答及审批界面均出现，两类 hook 被接收。审批使用 Esc 取消，随后退出。证据目录 `.tmp/t013-runtime-DyQO3H`。首次启动沙箱设置页选择 Esc 返回，没有安装／调整系统沙箱。
- **失败后修复**：新服务测试先因停止后的 PowerShell 子进程未关闭 stdin 而超时，另一个迁移 fixture 写错 state.json；关闭 stdin、改为真实 desktopplay.json 后通过。
- **失败后修复**：早期 hook 命令给可执行文件加引号导致真实宿主退出 1，改为可靠调用；特殊路径实测又发现模板 replacement 特殊字符展开，改为函数替换，最后三场景通过。
- **失败后修复**：首次运行时 fixture 的模型目录声明缺少 truncation_policy，移除不需要的模型目录后使用回环 provider 的回退元数据。初始 global bypass_hook_trust 配置不支持，测试改为 thread/start 专用隔离标志；生产不设置该标志。插件目录联网受限警告不影响回环合成模型，未因此放宽网络或真实账户配置。
- **环境失败**：Electron 受限启动遇已有 AppContainer ACL 错误；使用提权隔离 profile 重跑，没有改 ACL 或关闭应用沙箱。
- **失败后修复**：完整 Electron 第一轮 15/18，分别是旧完成关闭状态、缩短短句后候选不足、完成提示计时控件隐藏后的旧断言；更新场景以验证新规则，且增加开关独立变化的源基线，11 项相关回归通过。另一次新测试重启后未等待人物渲染，补实际可见等待后通过。
- **保留限制**：未运行真实账户、真实 Work／DSH 端到端、完整 IDE GUI、打包／安装卸载／覆盖升级、WSL／远程及其他 DSH 版本。真实 IDE 引擎协议验证与完整 IDE GUI 试用分开记录。T010 原生鼠标间歇偏移历史保留，单次通过不证明根因解决。

## 下一步

2026-10-22 用户授权推送并创建 PR；再次 fetch main 核实基准未变化，提交并推送实现后创建 PR #14。GitHub 连接器创建请求返回 403（集成权限不足），改用本机现有 Git 凭据调用官方 API 成功，未输出凭据。

审查 PR #14 的实际差异和隔离验证，检查远程 CI。合并与正式发布另按授权执行，发布时另做版本准备，保留历史 v0.5.4。真实客户端试用分别登记，不把合成模型或日志 fixture 当作真实账户验证。
