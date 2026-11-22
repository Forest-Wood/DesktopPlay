# T040 · 超级调色盘（主题色自定义）

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R042](../REQUIREMENTS.md#r042超级调色盘主题色自定义t040)。
- 负责人：Codex。
- 分支：`feat/T040-super-palette`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`2654ca9`（`feat/T039-pet-bubble-refresh` 的本地结果），远端 `main` 核实为 `0d20d93`。
- 结果提交：未提交。
- 已有未提交修改：T039 的实现与交接已在原分支本地提交，T040 从干净工作区开始。
- 本次未提交修改：主题设置、色阶与校验、调色盘和展示层、相关测试与交接。
- 状态：**已实现并通过本地验证，待审查**。

## 依赖

- 依赖 [T038](T038-persona-studio.md) 的设置页面和 [T039](T039-pet-bubble-refresh.md) 的气泡配色变量。

## 目标与范围

实现参考 QQ 超级调色盘思路的浅色主题色自定义系统：8 套预设色卡、随心调主色与 OKLCH 自动派生、分区覆盖、轻纹理、强度调节、从当前角色取色、WCAG AA 对比度保护，以及设置窗口与桌宠气泡的按需应用。详细规格见 [UI_REDESIGN.md](../UI_REDESIGN.md#7-超级调色盘主题色自定义r042)。

### 实现

- 新增 `src/shared/theme.ts`（纯函数）：
  - HEX ↔ OKLCH 转换与 CSS 变量色阶派生。超出 sRGB 色域的派生色先降低色度，再按量化后的 HEX 计算对比度。[W3C CSS Color 4](https://www.w3.org/TR/css-color-4/#color-conversion-code)
  - 预览分别显示主按钮、正文和气泡的对比度。颜色过浅时自动降低渲染色明度并展示调整值，用户输入的 HEX 仍可编辑和复用。状态色沿用已有 token。[W3C WCAG AA 对比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- 扩展 `AppSettings.theme`（`src/shared/types.ts`、`defaults.ts`、`desktop-service.ts`、`src/renderer/demo.ts`）：
  - 默认 `{ preset: 'sage', accent: '#28624f', overrides: {}, texture: 'none', intensity: 1, applyToSettings: true, applyToPet: false }`。
  - 主进程字段白名单、HEX 正则、`intensity` 0.6–1.4 与枚举校验，非法输入原子拒绝；旧配置缺少 `theme` 时补默认值。
- 在“系统 → 外观与调色盘”（`palette`）实现完整交互：
  - 8 套预设色卡（松绿、薄荷、海盐蓝、星光紫、樱粉、暖杏、墨灰、跟随角色）。
  - 随心调（色相环／HEX、分区独立覆盖、CSS 轻纹理无／点阵／细格／星光、强度滑块、从当前角色图片取色）。
  - 右侧迷你设置窗口、迷你桌宠气泡和 AA 读数。小窗口将读数移到预览顶部。底部提供应用范围、恢复默认及 `DP1.` 主题码复制和导入。
- “跟随角色”根据当前角色出厂气泡色实时派生。图片取色以不透明像素为样本，提供最多五种有区分度的候选。颜色单一的图片可能只有一到两种候选。
- 在展示层应用 CSS 变量（设置窗口写入 `:root`，桌宠写入 `.pet-canvas`）；保持 `BubbleStyle` 显式覆盖 ＞ 调色盘派生色 ＞ 人设出厂色，不改写 `bubbleProfilesByPersona`。

## 兼容边界与风险

- `applyToPet` 默认 `false`，保证老用户升级后桌宠外观与旧版像素一致。
- 用隔离 Electron 验证自带小鲸鱼素材和由同一素材导入的自定义 PNG Data URL 均能通过 Canvas 读取像素。取色在渲染层完成。
- 仍固定浅色模式（`color-scheme: light`），本期不做自定义窗口背景图与深色主题。

## 验收条件

1. 单元测试覆盖 `theme.ts` 色阶派生、AA 对比度修正、状态色隔离、非法输入拒绝及旧配置补默认值。
2. 隔离 smoke 覆盖：切换预设／随心调即时预览、放弃修改恢复、保存后重启生效、恢复默认，以及 `applyToPet=false` 时桌宠外观不变。
3. `npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run build` 与多配色截图核对通过。
4. 完成时清理 `T038` 的非跟踪临时测试产物（按 `T(N-2)` 规则）。

## 验证

| 检查 | 适用 | 结果 |
| --- | --- | --- |
| `npm.cmd run typecheck`、`npm.cmd run build` | T040 工作区 | 通过 |
| `npm.cmd test` | T040 工作区 | 31 个文件、340 项通过。新增色阶、AA 修正、非法输入、原子保存与旧配置兼容验证 |
| `npm.cmd run test:smoke -- --grep 'theme drafts\|packaged renderer\|studio keeps\|global mode switches\|version routing' --output .tmp/T040-smoke/final` | Windows Electron 开发构建、隔离配置 | 修正首轮 760×560 下读数在首屏外的问题后，5 项通过。覆盖保存、重启、撤销、恢复默认、角色取色、主题码和气泡样式优先级 |
| `npm.cmd run test:smoke -- theme-palette.spec.ts --output .tmp/T040-smoke/palette` | 最终构建、隔离配置 | 通过。复核读数分组，核对星光紫 1060×800、海盐蓝 760×560 截图 |
| `node .tmp/T040-smoke/pet-pixels.cjs <截图路径>` 与 SHA-256 比较 | T039 与最终 T040 开发构建、同一隔离条件和固定渲染时间 | 通过。默认 `applyToPet=false` 的小鲸鱼气泡截图文件完全一致。新增 smoke 也比较了保存不同设置窗口主题前后的气泡像素 |
| 真实系统剪贴板写入 | — | 未运行，隔离用例覆盖主题码生成、手动复制回退和导入 |

## 临时文件滚动清理

已核实 `.tmp/T038-smoke/` 为仓库内的非跟踪测试目录，路径和子项无重解析点，已删除。T039、T040 验证产物和正式任务记录仍保留。

## 下一步

审查 T040 工作区。开展 [T041](T041-ui-redesign-handoff.md) 时，从 T040 的结果提交创建独立分支。
