# T041 · 前端重设计文档收尾与交接

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R041](../REQUIREMENTS.md#r041设置窗口与桌宠气泡前端重设计t034t041)、[R042](../REQUIREMENTS.md#r042超级调色盘主题色自定义t040)。
- 负责人：Codex（前期 `DESIGN.md` 迁移与截图脚本起点）＋ Antigravity（补齐剩余截图、预览索引、README、交接文档与 T039 滚动清理）。
- 分支：`docs/T041-ui-redesign-handoff`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`46d5a0b`（`feat/T040-super-palette` 本地结果提交），远端 `main` 仍为 `0d20d93`。
- 结果提交：未提交。
- 已有未提交修改：接手时工作区已有同属 T041 的 `DESIGN.md` 迁移改动，以及 `.tmp/T041-capture/` 局部截图产物；本次在同一分支继续完成并整合。
- 本次未提交修改：`DESIGN.md`、`README.md`、`docs/UI_REDESIGN.md`、`docs/REQUIREMENTS.md`、`docs/PROJECT_STATE.md`、`docs/previews/T041/`（8 张正式截图与 `README.md`）、本任务记录。
- 状态：**已完成并通过文档与视觉核对，待审查**。

## 依赖

- 依赖 [T040](T040-super-palette.md)（`46d5a0b`）及 T035–T039 的已验证实现。

## 目标与范围

将 T035–T040 已实际落地的界面规范、视觉 token、气泡规则、伙伴可编辑昵称与超级调色盘契约迁移至正式设计文档 `DESIGN.md`，更新 README 正式截图与 `docs/previews/T041/`，精简 `docs/UI_REDESIGN.md` 为交接索引，完成本系列前端重设计收尾。

### 实现情况

- [DESIGN.md](../../DESIGN.md)：已写入 6 项导航结构、首页总览、`tokens.css` 变量、伙伴可编辑昵称（`AppSettings.petNicknames`）、账户页、提醒中心矩阵与健康色规则、人设工作室、192 DIP 桌宠气泡升级、超级调色盘（`AppSettings.theme`、`DP1.` 主题码、AA 对比度保护）及系统设置契约，顶部指向 [docs/previews/T041/README.md](../previews/T041/README.md) 与 [docs/UI_REDESIGN.md](../UI_REDESIGN.md)。
- [docs/previews/T041/](../previews/T041/README.md)：修正 `.tmp/T041-capture/capture.cjs` 中切白龙造型前未先切至 `gpt` 角色的问题，在隔离 Electron（`DESKTOPPLAY_USER_DATA` + `DESKTOPPLAY_TEST_NO_CODEX=1` + 虚构演示数据）下完整采集 8 张实拍截图（`settings-home.png`、`settings-reminders.png`、`settings-studio.png`、`settings-palette.png`、`settings-palette-compact.png`、`pet-deepseek.png`、`pet-codex.png`、`pet-gemini.png`），写入 `docs/previews/T041/` 并建立索引文档 `README.md`。
- [README.md](../../README.md)：更新“桌宠与功能”要点与主展示截图为 `docs/previews/T041/` 最新实拍图，保留既有历史版本升级说明。
- [docs/UI_REDESIGN.md](../UI_REDESIGN.md)：删除已迁入 `DESIGN.md` 的重复规划描述，收拢为 R041／R042 决策摘要与 T034–T041 阶段索引。
- [docs/REQUIREMENTS.md](../REQUIREMENTS.md) 与 [docs/PROJECT_STATE.md](../PROJECT_STATE.md)：同步 R041／R042 为“已实现待审查”，更新 T040 提交号与 T041 当前状态。

- **对话提醒去重修复（2026-11-22 预览反馈）**：移除 `src/renderer/settings.ts` 与 `src/renderer/settings/views/reminders.ts` 中将 `.reminder-balance` 搬移到 `#completion` 下方的重复展示逻辑，使“余额提醒”仅独立保留在“提醒中心 → 余额提醒”子页；同步更新 `reminders.css`、`tests/smoke/reminder-center.spec.ts`、`DESIGN.md` 与 `docs/previews/T041/settings-reminders.png`。

## 兼容边界

- 除响应预览反馈移除“对话提醒”页重复的余额提醒卡片外，不改动共享类型、IPC、持久化格式或软件版本（是否发版及版本号由用户另行决定；按版本规则 T040 新增调色盘属 `minor`）。

## 验收条件

1. `DESIGN.md`、`README.md`、`docs/UI_REDESIGN.md`、`docs/REQUIREMENTS.md`、`docs/PROJECT_STATE.md` 与实际实现一致，无断链或过时规划描述。
2. 全部 8 张正式截图均在隔离环境使用虚构演示数据生成，不含真实 API Key、账户标识、账本或本地客户端路径。
3. `git diff --check` 通过。
4. 按 `T(N-2)` 规则清理 `T039` 的非跟踪临时测试产物。

## 验证

| 检查 | 适用 | 结果 |
| --- | --- | --- |
| `node .tmp/T041-capture/capture.cjs` | T041 隔离 Electron（固定时钟与虚构演示数据） | 首次运行因未先 `selectPet('gpt')` 导致 `pet-codex` 断言失败；修正后 8 张截图全部采集成功 |
| 全部 8 张截图逐张目视与脱敏审查 | `docs/previews/T041/*.png` | 通过：排版无溢出裁切，仅含虚构余额／额度／目录占位，无真实凭据或账户标识 |
| 文档相对链接、锚点与实现一致性核对 | T041 工作区 | 通过 |
| `npm.cmd run build`（含 `tsc --noEmit`） | T041 工作区（含对话提醒去重修复） | 通过 |
| `npm.cmd test` | T041 工作区（含对话提醒去重修复） | 31 个文件、340 项单元测试全部通过 |
| `npm.cmd run test:smoke -- reminder-center.spec.ts --output .tmp/T041-capture/smoke-reminders` | T041 隔离 Electron | 1 项通过，确认 `#completion` 不再包含 `.reminder-balance` 且 `#reminders` 保存正常 |
| `git diff --check` | T041 工作区 | 通过 |

## 临时文件滚动清理

已核实 `.tmp/T039-smoke` 位于仓库内、无 Git 跟踪文件、无重解析点（`ReparseCount: 0`），已删除。保留 T040（`.tmp/T040-smoke/`）与 T041（`.tmp/T041-capture/`）最近两轮临时产物及所有正式文档。

## 下一步

1. 用户审阅 `docs/T041-ui-redesign-handoff` 工作区改动，授权后执行本地提交。
2. 按用户授权决定是否推送分支、创建 PR／合并到 `main`，以及是否以 `minor` 规划下一个正式发布版本。
