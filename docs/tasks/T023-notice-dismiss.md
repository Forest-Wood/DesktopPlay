# T023：提醒关闭方式与 VS Code 提问优先显示

- 日期：2026-11-12（Asia/Shanghai）；负责人：Codex；需求 R030。
- 状态：实现及针对性隔离验证通过，真实 VS Code 客户端提问验收待完成。
- 分支：`feat/T023-notice-dismiss`；目标合并分支 main；目录 `D:\desktop1\DesktopPlay-T023`。
- 远程：本次 `git fetch origin main` 成功，基准 `cc318beab5b92e59107983a5d8751b2511a83b98`；初始实现未提交；2026-11-12 获得提交、推送、PR 授权，结果见文末；未发布，版本保持 1.1.0。
- 依赖：从原工作区复制全部既有 T022 未提交文件，未修改原工作区业务代码。原始快照及 SHA256 清单交付后归档于主目录 `.tmp/T023-handoff/T022-baseline/`、`.tmp/T023-handoff/T022-baseline.json`；复制前后核验一致。原有 DESIGN、README、设置页、气泡编辑器、smoke、需求和状态文件修改，以及 T022 任务记录与 CSS，均不能归为 T023 新产出。
- 本次范围：共享气泡规则及校验、气泡编辑器、渲染计时与队列、接入状态文案、相关测试和本文档。不改 hook 信任、真实账户、会话、客户端配置或 IPC 通道。

## 实现与决定

- 规则增加可选 `dismissal: { mode: 'click' | 'timed', seconds: number }`；缺省解析为 click / 5 秒。秒数必须是 1–60 的整数，旧规则无需写盘迁移；现有 settings 持久化通道保存新字段。
- 按角色、来源、完成／等待场景独立设置；自定义 GPT 沿用原版 GPT。点击模式保留隐藏的秒数；恢复默认回到 click / 5。等待气泡收起不代表回答完成。
- 通知展示时计时，悬浮和普通广播不延长；保存当前规则的关闭配置会重新计时。关闭、隐藏、切换角色及 dispose 清理计时器；展示队列中的下一项使用自己的时间。
- 确定的漏提醒原因：原 `flushCompletion` 在 completionActive 时直接返回，常驻完成气泡可无限阻塞提问。现在允许启用的提问／审批优先显示，原完成事件回到队列，随后恢复显示。没有修改工具 matcher，也没有声称解决所有 hook 来源问题。
- 设置文案区分“已配置、等待实际事件”和“已收到等待回应事件”，提示保存工作、重新加载 VS Code 并新建会话。

## 验证

- 通过：`npm.cmd run build`（含 typecheck）。
- 通过：`npx.cmd vitest run tests/unit/bubble-settings.test.ts tests/unit/services/bubble-migration.test.ts tests/unit/services/conversation-attention.test.ts`，17 项。
- 通过：`npx.cmd playwright test tests/smoke/gpt-attention.spec.ts --grep 'T023|hook guide'`，2 项。使用隔离 profile、模拟账户／事件和进程来源；真实 PowerShell relay 脚本运行，不修改真实 hooks.json。
- 新交互测试覆盖设置保存与状态回读、两种尺寸无横向溢出、提问抢占常驻完成、定时消失恢复完成、提前点击与旧计时器清理、键盘关闭。初次截图未滚动到新控件，修正截图步骤并复验；最终截图 `test-results/T023-dismiss-settings.png` 已审查，新控件可见且不被保存栏遮挡。
- 通过：`git diff --check`；仅 CRLF 转换提示，无空白错误。
- 未运行：真实 VS Code 提问卡片端到端、应用重启后新设置回读、全量测试、安装／升级／卸载。真实验收缺少受控的新提问卡片及 GUI 观察，本轮仅隔离链路，不宣称真实客户端问题全部恢复。持久化机制沿用现有路径，未单独扩展重启矩阵。

## 整合与交付

2026-11-12 用户要求统一在 `D:\desktop1\DesktopPlay` 工作并授权推送和创建 PR。核对原目录全部 T022 文件与依赖基线 SHA256 一致后合入 T023 增量，交付分支 `feat/T022-companion-ui`，包含两项任务。独立目录已在交付后按用户要求移除。

原目录重新运行 build、上述 17 单测与 2 项隔离交互全部通过（12.2 秒），diff 检查通过；未重跑无关全量测试。安装中的桌宠未替换。真实 VS Code 提问卡片验收仍待完成；待 PR 审阅，不合并、不发布。

## PR 交接（2026-11-12）

实现提交 `640d334`，已推送 `origin/feat/T022-companion-ui`；[PR #25](https://github.com/Forest-Wood/DesktopPlay/pull/25) 已创建，目标 main，包含 T022／T023。待审阅，未合并、未发布。当前交付目录为 `D:\desktop1\DesktopPlay`。

## 本地目录收尾

2026-11-12 核对独立目录 19 个改动文件：业务代码全部与主目录一致，三份文档差异为较早交接状态。将依赖快照、测试证据及旧文档归档到主目录 `.tmp/T023-handoff/` 后移除 node_modules junction 和独立 worktree。已确认本地只剩 `D:\desktop1\DesktopPlay`，主目录依赖完整；未删除 Git 分支或历史。
