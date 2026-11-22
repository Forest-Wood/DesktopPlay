# T041 · 前端重设计文档收尾与交接

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R041](../REQUIREMENTS.md#r041设置窗口与桌宠气泡前端重设计t034t041)、[R042](../REQUIREMENTS.md#r042超级调色盘主题色自定义t040)。
- 负责人：待定（开工前确认）。
- 分支：`docs/T041-ui-redesign-handoff`（建议）；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：待核实 `feat/T040-super-palette` 的结果提交。
- 结果提交：未提交。
- 已有未提交修改：开工前核实工作区状态。
- 状态：**待开发**。

## 依赖

- 依赖 [T040](T040-super-palette.md) 和 T035–T039 的已验证实现。

## 目标与范围

将 T035–T040 已实际落地的界面规范、视觉 token、气泡规则、伙伴可编辑昵称与超级调色盘契约迁移至正式设计文档 `DESIGN.md`，更新 README 正式截图与 `docs/previews/`，清理 `docs/UI_REDESIGN.md` 中已过时的“规划”表述，完成本系列前端重设计收尾。

### 计划改动清单

- 更新 `DESIGN.md`：写入已落地的 6 项导航结构、首页总览、提醒中心矩阵、人设工作室、伙伴可编辑昵称、桌宠气泡新规格与超级调色盘数据模型／token。
- 更新 `README.md` 展示截图与 `docs/previews/` 中正式界面预览图（确保不含真实账户、密钥或私人配置）。
- 精简或归档 `docs/UI_REDESIGN.md` 中已迁入 `DESIGN.md` 的内容，避免两处长期重复。
- 更新 `docs/REQUIREMENTS.md`（R041／R042 状态）与 `docs/PROJECT_STATE.md`。

## 兼容边界

- 纯文档与正式截图整理，不修改业务代码，不单独升级软件版本号（是否发版及版本号由用户另行决定；按版本规则 T040 新增调色盘属 `minor`）。

## 验收条件

1. `DESIGN.md`、`README.md`、`docs/REQUIREMENTS.md`、`docs/PROJECT_STATE.md` 与实际实现完全一致，无断链或过时规划描述。
2. 所有新截图均使用隔离／演示数据，无真实账本、凭据或私人信息泄露。
3. `git diff --check` 通过。
4. 完成时清理 `T039` 的非跟踪临时测试产物（按 `T(N-2)` 规则）。

## 验证

| 检查 | 适用 | 结果 |
| --- | --- | --- |
| 文档相对链接、锚点与实现一致性核对 | — | 未运行 |
| 截图脱敏审查 | — | 未运行 |
| `git diff --check` | — | 未运行 |

## 下一步

1. 从 T040 分支的结果提交创建 `docs/T041-ui-redesign-handoff`。
2. 对照已验证的实现完成 `DESIGN.md` 迁移与正式截图更新。
