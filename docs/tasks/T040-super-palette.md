# T040 · 超级调色盘（主题色自定义）

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R042](../REQUIREMENTS.md#r042超级调色盘主题色自定义t040)。
- 负责人：待定（开工前确认）。
- 分支：`feat/T040-super-palette`（建议）；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：待 T038、T039 合入后核实最新 `origin/main`。
- 结果提交：未提交。
- 已有未提交修改：开工前核实工作区状态。
- 状态：**待开发**。

## 依赖

- 依赖 [T038](T038-persona-studio.md) 与 [T039](T039-pet-bubble-refresh.md) 已完成并合入。

## 目标与范围

实现参考 QQ 超级调色盘思路的浅色主题色自定义系统：8 套预设色卡、随心调主色与 OKLCH 自动派生、分区覆盖、轻纹理、强度调节、从当前角色取色、WCAG AA 对比度保护，以及设置窗口与桌宠气泡的按需应用。详细规格见 [UI_REDESIGN.md](../UI_REDESIGN.md#7-超级调色盘主题色自定义r042)。

### 计划改动清单

- 新增 `src/shared/theme.ts`（纯函数）：
  - HEX ↔ OKLCH 转换与整套 CSS 变量色阶派生（`accent`、`accent-strong`、`accent-soft`、`selected`、`nav`、`stage-tint`、`stage-ring`、`line`）。
  - WCAG AA（≥4.5:1）对比度检测与自动加深保护；状态色（`--ok`/`--info`/`--warn`/`--err`/`--off`）固定不参与派生。
- 扩展 `AppSettings.theme`（`src/shared/types.ts`、`defaults.ts`、`desktop-service.ts`、`src/renderer/demo.ts`）：
  - 默认 `{ preset: 'sage', accent: '#28624f', overrides: {}, texture: 'none', intensity: 1, applyToSettings: true, applyToPet: false }`。
  - 主进程字段白名单、HEX 正则、`intensity` 0.6–1.4 与枚举校验，非法输入原子拒绝；旧配置缺少 `theme` 时补默认值。
- 在“系统 → 外观与调色盘”（`palette`）实现完整交互：
  - 8 套预设色卡（松绿、薄荷、海盐蓝、星光紫、樱粉、暖杏、墨灰、跟随角色）。
  - 随心调（色相环／HEX、分区独立覆盖、CSS 轻纹理无／点阵／细格／星光、强度滑块、从当前角色图片取色）。
  - 右侧迷你设置窗口＋迷你桌宠气泡实时预览与 `AA ✓/✗` 对比度比值；底部应用范围开关、恢复默认与可选“主题码”复制／粘贴。
- 在展示层应用 CSS 变量（设置窗口写入 `:root`，桌宠写入 `.pet-canvas`）；保持 `BubbleStyle` 显式覆盖 ＞ 调色盘派生色 ＞ 人设出厂色，不改写 `bubbleProfilesByPersona`。

## 兼容边界与风险

- `applyToPet` 默认 `false`，保证老用户升级后桌宠外观与旧版像素一致。
- 开工前先验证渲染层 `<canvas>` 对自定义本地图片 URL 取色是否存在 taint 限制；若受限，按 AGENTS 约定先说明影响再评估只读主进程 `nativeImage` IPC 方案。
- 仍固定浅色模式（`color-scheme: light`），本期不做自定义窗口背景图与深色主题。

## 验收条件

1. 单元测试覆盖 `theme.ts` 色阶派生、AA 对比度修正、状态色隔离、非法输入拒绝及旧配置补默认值。
2. 隔离 smoke 覆盖：切换预设／随心调即时预览、放弃修改恢复、保存后重启生效、恢复默认，以及 `applyToPet=false` 时桌宠外观不变。
3. `npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run build` 与多配色截图核对通过。
4. 完成时清理 `T038` 的非跟踪临时测试产物（按 `T(N-2)` 规则）。

## 验证

| 检查 | 适用 | 结果 |
| --- | --- | --- |
| `npm.cmd run typecheck` | — | 未运行 |
| `npm.cmd test`（含 `theme` 与校验单测） | — | 未运行 |
| `npm.cmd run build` | — | 未运行 |
| 调色盘持久化／重启／恢复默认 smoke 与截图核对 | — | 未运行 |

## 下一步

1. T038、T039 合入后切出 `feat/T040-super-palette`。
2. 先完成自定义图片 `<canvas>` 取色可行性验证与 `src/shared/theme.ts` 纯函数单测，再接入持久化与调色盘页面。
