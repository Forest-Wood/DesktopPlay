# T029 · 更新下载预计剩余时间与 Gemini 任务完成气泡修复

- 日期：2026-11-19（Asia/Shanghai）。
- 需求：[R036](../REQUIREMENTS.md#r036更新下载预计剩余时间估计与-gemini-任务完成气泡修复t029)。
- 负责人：Antigravity。
- 分支：`fix/T029-update-eta-gemini-completion`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`a9ab688`（远程 `origin/main`）。
- 结果提交：实现提交 `fa71a1d`；交接提交见同分支后续提交。
- 已有未提交修改：开始任务前工作区干净；本任务共 19 个文件（含需求／任务／状态文档及 `AGENTS.md`、PR 模板流程补充）。
- 状态：待审查（已通过隔离构建、单测与 Electron 冒烟测试；待创建并核对 PR）。

## 目标与范围

1. **应用界面更新下载预计剩余时间（ETA）**：在“关于 → 版本与更新”的下载进度区域展示下载速度与预计剩余时间估计，同时适用于安装版（NSIS）与免安装版（Portable）。
2. **修复 Gemini 任务完成提示气泡（VS Code 与桌面 App 均未展示）**：排查并修复 Gemini 完成气泡不触发的根因，使桌面 App 与 VS Code（`google.google-antigravity`）默认开箱即可弹出完成提示气泡，同时修复 `hooks.json` `Stop` 转发脚本的协议不匹配问题。

修改范围：`src/shared/types.ts`、`src/shared/app-update.ts`、`src/main/services/app-update.ts`、`src/main/services/installed-update.ts`、`src/renderer/settings.ts`、`src/renderer/settings.css`、`build/gemini-hook.ps1`、`src/main/services/gemini-waiting.ts`、`src/main/services/gemini-notices.ts`、`src/main/main.ts`，以及对应单元／冒烟测试与项目文档。不改动版本号（保持 `2.0.1`）及持久化配置结构。

## 根因分析与实现要点

### 1. 软件更新下载预计剩余时间估计

- `AppUpdateState` 新增 `bytesPerSecond: number | null` 与 `estimatedRemainingSeconds: number | null`（由 `initialUpdateState()` 初始化为 `null`）。
- `InstalledUpdateBackend` 转发 `electron-updater` 的 `bytesPerSecond`；`AppUpdateService.download()` 在主进程使用 5 秒滑动窗口 + EMA 平滑估算实时速率与剩余秒数（同时覆盖 NSIS 与 Portable），停滞 ≥ 0.5 秒无新增字节时清空过期速率并重置采样窗口；检查、完成、取消与报错时清零。
- `src/shared/app-update.ts` 提供 `formatUpdateSpeed`、`formatUpdateEta`、`formatUpdateDownloadDetail`，在设置页 `#update-bytes`（等宽数字 `tabular-nums`）展示 `已下载 / 总大小 MiB · 速率 · 预计剩余约 …`；未获取总大小时显示“正在连接下载源…”，初期或停滞时显示“预计剩余时间计算中…”。

### 2. Gemini 任务完成提示气泡未展示（VS Code 与 App 端）

通过核对本机 Antigravity 2.0 内置钩子规范（`~/.gemini/antigravity/builtin/skills/agy-customizations/docs/hooks.md`）、只读检查 `~/.gemini/antigravity/conversation_summaries.db` 表结构与 `%APPDATA%\DesktopPlay\integrations` 目录，确认存在三处叠加根因：

1. **默认仅依赖未开启且折叠隐藏的 `hooks.json`**：`DEFAULT_SETTINGS.geminiCompletionEnabled` 默认为 `true`，但 `geminiHookEnabled` 默认为 `false` 且折叠在“接入与目录设置”下；此前 `GeminiNotices` 未开启 hook 时完全不检测完成事件。
2. **`build/gemini-hook.ps1` 校验条件与 Antigravity 2.0 实际 `Stop` 载荷不匹配（即使手动开启 hook 也会 100% 丢弃事件）**：
   - 脚本检查 `$event.terminationReason -ceq 'model_stop'`，而 Antigravity 2.0 实际枚举值为 **`'NO_TOOL_CALL'`**。
   - 脚本检查 `$null -ne $event.executionNum`，而 Antigravity 使用 protojson 编码，正常首轮结束时 `executionNum` 为默认值 `0` 会被省略（`$null`），导致所有正常完成事件被过滤。
3. **本机只读摘要已同时覆盖桌面 App 与 VS Code**：实测 `google.google-antigravity` VS Code 扩展与桌面 App 共用 `~/.gemini/antigravity/conversation_summaries.db`，且表中包含 `status`（`CASCADE_RUN_STATUS_RUNNING` → `CASCADE_RUN_STATUS_IDLE`）、`not_fully_idle`、`killed`、`step_count`、`last_user_input_step_index`、`last_user_input_time` 等完整字段。

**修复实现**：
- **`GeminiWaiting`（`src/main/services/gemini-waiting.ts`）**：在只读扫描 `conversation_summaries.db` 时同时监听主会话完成事件（默认开启，无需 `hooks.json`）。首次启动或桌宠重新显示时先建立基线不补发历史；后续轮询识别 `RUNNING`／活跃转 `IDLE` 以及两次轮询间完成的快速轮次，过滤子任务（`parent_conversation_id`／`nesting_depth`）、已取消（`killed`）、等待回应中（`waitingSteps` 非空）和仅写入用户消息尚未产出回复的轮次；支持旧表结构降级。
- **`build/gemini-hook.ps1`**：接受 `'NO_TOOL_CALL'`（并保留 `'model_stop'` 兼容），缺失的 `executionNum` 默认按 `0L` 处理；对 `ERROR`／`USER_CANCELED` 显式写入 `ok: false` 供主进程抑制对应轮次误报。
- **`GeminiNotices` & `src/main/main.ts`**：`hook || completion || attention` 任一开启即启动轮询；与 `GeminiWaiting` 共享轮次级 `seenTurns` 去重集合避免双源重复弹泡；`petWindow.on('show')` 调用 `geminiNotices.discardHiddenHistory()` 满足隐藏不补弹；更新设置页来源说明与状态文案（明确标注 `App／VS Code` 与本机摘要监听）。

### 3. 开发流程补充与临时测试文件滚动清理

- 按用户要求在 `AGENTS.md`、`.github/pull_request_template.md` 与 `docs/PROJECT_STATE.md` 中新增“完成 `T(N)` 时删除 `T(N-2)` 非跟踪临时测试文件（例如完成 `T099` 时清理 `T097`）”的滚动清理规范，保护所有 Git 跟踪文件、正式任务记录及最近两轮（`T(N-1)`／`T(N)`）产物。
- 本次完成 T029 同步执行 `T027` 清理：已移除未跟踪的 `.tmp/T027-PR.md` 与 `.tmp/T026-retention-smoke`（T027 冒烟输出目录），保留 `.tmp/T028-*` 与 `.tmp/T029-*`。

## 验证命令与结果

| 检查命令 | 适用状态 | 结果与说明 |
| --- | --- | --- |
| `npm.cmd run build` | 工作区（`fix/T029-update-eta-gemini-completion`） | 通过，含 `tsc --noEmit`、Vite 构建与 esbuild 主进程／预加载及脚本复制 |
| `npm.cmd test -- --reporter=dot` | 工作区（首次运行后修复停滞恢复采样窗口重置） | 通过（29 文件、329 项全量通过；首次新增单测发现停滞恢复时未重置采样锚点导致残留旧速率，修复 `app-update.ts` 后全量通过） |
| `npx.cmd playwright test tests/smoke/app-update.spec.ts tests/smoke/gemini.spec.ts --output=.tmp/T029-smoke-results` | 工作区（隔离 profile） | 通过（2/2，20.7s），核验更新下载进度显示速率与 ETA、取消清零、默认未开 hook 时数据库完成气泡弹出及 `NO_TOOL_CALL` 省略 `executionNum` 转发去重 |
| `git diff --check` | 工作区 | 通过 |
| 真实 VS Code／桌面 App 完成气泡与真实下载 ETA | 真实环境 | 未运行（不触碰真实配置与真实网络下载，待用户验收） |

## 下一步

- 请用户在本地验证：
  1. 启动新版桌宠（无需再手动开启 Gemini hook）分别在 VS Code 与桌面 App 端完成一轮对话，确认 Gemini 任务完成气泡正常弹出；
  2. 后续触发更新下载时核对进度条下方的速率与预计剩余时间展示；
  3. 确认后按授权决定是否提交、推送、创建 PR 或发布补丁版本。
