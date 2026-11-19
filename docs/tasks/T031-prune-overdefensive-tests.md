# T031 · 精简过度防御性测试并补充测试编写规范

- 日期：2026-11-19（Asia/Shanghai）。
- 需求：[R038](../REQUIREMENTS.md#r038精简过度防御性测试并补充测试编写规范t031)。
- 负责人：Antigravity。
- 分支：`chore/T031-prune-overdefensive-tests`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`8930e89`（远程 `origin/main`）。
- 结果提交：未提交。
- 已有未提交修改：开始任务前工作区干净；本任务仅涉及测试精简与协作文档更新，不改动生产业务代码或版本号（保持 `2.0.2`）。
- 状态：已实现待审查（构建、全量单测、更新助手测试与全量 Electron 冒烟测试均已通过）。

## 目标与审查结论

全面审查 `tests/` 目录（原 29 个单元测试文件 329 项、11 个 Electron 冒烟测试文件 27 项及 2 套 PowerShell 助手脚本），按“保留核心功能、持久化兼容、跨角色行为与关键安全边界，移除极端合成场景与跨层重复矩阵”的原则完成精简，并将“避免过度防御性测试”写入协作规范。

### 1. 移除的冗余／过度防御测试文件（3 个）

| 文件 | 移除原因 |
| --- | --- |
| `tests/smoke/bubble-update.spec.ts` | 毫秒级假时钟（`2999ms`/`1ms`/`1999ms`）悬停计时循环、12 组倒计时布局循环与重复白底校验；气泡翻页／挽留／设置与白底已由 `desktop.spec.ts` 覆盖，倒计时格式化已由 `quota.test.ts` 单测覆盖 |
| `tests/smoke/chatgpt-completion.spec.ts` | 日志解析、轮转、去重与开关恢复已由 `chatgpt-completion.test.ts` 单测在 150ms 内覆盖；ChatGPT App 端到端日志到气泡已由 `gpt-attention.spec.ts` 覆盖，原文件另含 4.4s 实墙等待 |
| `tests/unit/services/update-files.test.ts` | 全文通过 mock `fs.realpath` 构造 8.3 短路径（`SHORT~1.exe`）同字节不同文件别名；真实的目录联接（junction）与非法路径拒绝已由 `app-update.test.ts` 覆盖 |

### 2. 精简的 Electron 冒烟测试（27 项 → 19 项）

- `tests/smoke/conversation-attention.spec.ts`：移除与 `gpt-attention.spec.ts`／`completion-notice.spec.ts` 完全重复的提醒队列用例，保留独立的短句候选保存与重启持久化用例。
- `tests/smoke/desktop.spec.ts`：移除 4 姿态 × 3 事件共 12×350ms 睡眠的合成 `PointerEvent`／`DOMMatrixReadOnly` 按压测试；精简音频槽位测试（由 6 次 WAV 导入交叉比对改为代表性导入／试听／停止／重置与卸载保护，完整 15 槽位隔离已由 `sound-assets.test.ts` 覆盖）；移除 4 套餐循环与脆弱的 CSS `gap` 像素断言，保留 `plus`（含过期错误态）与 `null`（仅周额度未知套餐）代表性校验。
- `tests/smoke/pet-mode.spec.ts`：将 5 次独立 Electron 启动合并为 2 项聚焦测试（全局简洁／完整模式切换、重启持久化、小鲸鱼峰谷时段显示及简洁模式静默规则；设置页导航、保存栏与 760×560 布局），移除 4 角色 × 3 类型 = 12 轮反复切模式循环与重复的独立时段启动（峰谷与未知年份计算已由 `deepseek-time.test.ts` 全覆盖）。
- `tests/smoke/persona-notifications.spec.ts`：将 3 角色 × 3 来源（9 组）笛卡尔积循环精简为代表性 2 角色 × 2 来源队列、仅声音播放、隐藏取消与跨角色余额提醒验证。
- `tests/smoke/gpt-attention.spec.ts`：将 3 角色 × 2 主机（6 组）循环精简为 `whale/local/question` 与 `dragon/durable/approval` 代表性端到端路径，保留抑制、开关与隐藏丢弃验证。
- `tests/smoke/completion-notice.spec.ts`：移除 4 段重复的 `setTimeout(2200/2300)` 隐藏等待睡眠（隐藏丢弃已由 `codex-completion.test.ts` 毫秒级覆盖并由本文件第 3 项用假时钟验证）。

### 3. 精简的单元测试与助手脚本

- `tests/unit/services/codex-completion.test.ts`：移除 2 项共插入 10,004 条记录的 5000 缓存淘汰压测用例。
- `tests/unit/services/chatgpt-completion.test.ts`：移除强制 `utimes` 同时间戳等长覆写的极端合成用例。
- `tests/unit/sound-assets.test.ts`：移除手工拼装 5 MiB 多页 OGG 并 spy `Buffer.concat` 的极端分片用例。
- `tests/unit/services/desktop-service.test.ts`：移除忽略 `AbortSignal` 的伪造 fetch 超时、重复的保存并发中间态注入以及无余额请求期间时区往返切换 3 项过度防御用例（保留核心原子回滚与时区分段单测）。
- `tests/unit/clean.test.ts`：移除重复的第二项目录联接用例（保留 `refuses nested directory links`）。
- `tests/update-helper-fixtures.ps1`：将耗时约 2 分钟的来源进程等待超时用例改为显式 `-IncludeSlowTimeout` 参数；默认运行 6 项核心安全场景（成功替换、启动失败回滚、取消、目标篡改、文件占用、只读目标），CI 耗时缩短约 2 分钟。

### 4. 文档更新与 `T(N-2)` 滚动清理

- 在 `AGENTS.md`（“环境与常用命令”及“PR 模板与完成标准”）与 `.github/pull_request_template.md` 中正式补充“避免过度防御性测试”原则与 PR 核对项，并更新 `tests/update-helper-fixtures.ps1` 说明。
- 按 `T(N-2)` 滚动清理规则清理 `T029` 的非跟踪临时文件（`.tmp/T029-PR.md`、`.tmp/T029-smoke-results`），保留 T030 与 T031 产物。

## 验证命令与结果

| 检查命令 | 适用状态 | 结果与说明 |
| --- | --- | --- |
| `npm.cmd run build` | 工作区（`chore/T031-prune-overdefensive-tests`） | 通过（`tsc --noEmit`、Vite 与 esbuild） |
| `npm.cmd test -- --reporter=dot` | 工作区 | 通过（28 文件、318 项全量通过；原 29 文件 329 项） |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tests/update-helper-fixtures.ps1` | 工作区 | 通过（6 项快速安全场景全部 PASS，耗时约 10s；原含 2 分钟等待超时耗时约 130s） |
| `npx.cmd playwright test --output=.tmp/T031-smoke-results` | 工作区（首次运行 `pet-mode.spec.ts` 因合并用例后未在切入简洁模式前清零音频计数失败，补清零后重跑） | 首次 18/19 通过（1.3 分钟）；修复后单独复跑 `pet-mode.spec.ts` 2/2 通过（5.3s），19 项冒烟测试全部通过（原 27 项） |
| `git diff --check` | 工作区 | 通过 |

## 下一步

- 请用户确认精简范围与文档规范；按后续授权决定是否提交、推送并创建 PR。

