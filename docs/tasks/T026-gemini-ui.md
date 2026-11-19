# T026 · Gemini 界面与形象方向优化

- 日期：2026-11-19（Asia/Shanghai）。
- 需求：[R033](../REQUIREMENTS.md#r033gemini-界面与形象方向优化t026)。
- 负责人：Antigravity。
- 分支：`feat/T026-gemini-ui`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`3a211f525bf304a535cdc0dfc59c903f15c55d9a`（已通过 [PR #28](https://github.com/Forest-Wood/DesktopPlay/pull/28) 合入远程 `main` `7dc840f7db71b0985629183bee9d252232695f17`）。
- 结果提交：实现提交 `a799021`、交接提交 `8c8c69e`，已通过 [PR #29](https://github.com/Forest-Wood/DesktopPlay/pull/29) 合入 `main`（合并提交 `c101c7ec0759956d8cd66fe8e64a6d82aa5921a3`）。
- 已有未提交修改：开始任务前工作区干净；本任务共 16 个文件。
- 状态：已合并。

## 目标与范围

参考 Impeccable 设计方法论（`critique`、`typeset`、`layout`、`colorize`、`polish` / `distill`）与项目界面规范 [DESIGN.md](../../DESIGN.md)，优化 Gemini 在桌宠气泡、设置页额度面板、角色舞台及对话提醒卡片中的视觉层级与一致性；同时按用户要求将内置的两张 Gemini 角色形象（经典与手绘）做左右对称翻转。

修改范围：`public/assets/gemini-{classic,sketch}.png`、`src/shared/defaults.ts`、`src/renderer/gemini-quota.ts`、`src/renderer/quota.css`、`src/renderer/pet.ts`、`src/renderer/styles.css`、`src/renderer/settings.ts`、`src/renderer/settings-workspace.css`、测试 `tests/unit/assets.test.ts`、`tests/unit/renderer/quota.test.ts`、`tests/smoke/gemini.spec.ts` 及设计／状态文档。不新增第三方依赖、IPC 或持久化配置字段，保持应用版本 `2.0.0` 不变。

## 重要决定与实现要点

- **形象水平对称翻转与像素边界同步**：通过无损 PNG 扫描线翻转将 `public/assets/gemini-classic.png` 与 `public/assets/gemini-sketch.png`（均为 `1254 × 1254` RGBA）左右镜像，使默认屏幕右下角站位时角色朝向屏幕内侧与气泡，且左耳避开气泡尾巴位置。翻转后实测非透明像素包围盒：`classic` 为 `{ x: 1, y: 9, width: 1253, height: 1245 }`，`sketch` 仍为 `{ x: 0, y: 0, width: 1254, height: 1254 }`，已同步更新 `GEMINI_PETS`。
- **桌宠气泡双列紧凑排版**：`.bubble-quota .gemini-quota-row` 采用左列标题 `<span>`（`11px`）与重置时间 `<small>`（`9px`）上下堆叠、右列剩余百分比 `<strong>`（完整模式 `18px`、简洁模式 `19px` 等宽粗体）跨两行垂直居中的双列网格；行间使用柔和细分割线，并对 `0%`（`data-state="empty"`）、共用池（`data-state="shared"`）与未提供（`data-state="missing"`）做语义样式区分。三行在固定 `236 × 192` 气泡的 `.bubble-content` 内完整显示，无纵向裁切。
- **设置页 Gemini 额度三栏卡片化**：在 `#gemini .section-heading` 右侧增加 `#gemini-status-chip` 状态胶囊（显示 `已连接 Antigravity`、`正在刷新`、`读取异常`、`尚未读取` 或 `演示额度`）；`#gemini-quotas` 改为响应式三栏浅色卡片（`#f7f9f6`），左对齐展示 `32px` 剩余百分比、`<progress>` 进度条、倒计时与本地重置时间，并接入 30 秒倒计时刷新。
- **星猫专属角色舞台与三栏选择器**：在 `pet.ts` 与 `settings.ts` 中同步切换 `gemini-theme`，在 `settings-workspace.css` 为 `#app.gemini-theme` 提供星光紫舞台色（`--companion-tint: #f2ecfb`、`--companion-ring: #dfd3f2`）。将“角色与模式”顶层选择器改为三栏并排网格（窄窗口自动折为单列），并为 Gemini 的经典／手绘两款造型补充共用说明与造型副标题。
- **提醒卡片与关于说明补齐**：将“对话提醒”中 `Gemini · Antigravity` 卡片的开关顺序调整为左“需要回应时提醒”、右“完成时提醒”，与其余三张卡片对齐；在“关于 DesktopPet”、“使用说明”和“素材与许可证”页面补入 Gemini 相关说明。

## 验证命令与结果

| 检查命令 | 适用状态 | 结果与说明 |
| --- | --- | --- |
| `npm.cmd run build` | 工作区（基于 `3a211f5`） | 通过，含 `tsc --noEmit`、Vite 渲染层构建与 esbuild 主进程／预加载构建 |
| `npx.cmd vitest run tests/unit/assets.test.ts tests/unit/renderer/quota.test.ts tests/unit/services/gemini.test.ts` | 工作区 | 3 个文件、22 项单测全部通过，覆盖翻转后 PNG 尺寸、非透明边界与 Gemini 状态胶囊 |
| `npm.cmd test -- --reporter=dot` | 工作区（受限沙箱内） | 29 个文件中 26 个文件、319 项通过；3 个更新／清理测试文件共 5 项在受限沙箱内因 `%TEMP%` 创建 symlink/hardlink 返回 `EPERM` 失败 |
| `npx.cmd playwright test tests/smoke/gemini.spec.ts --output=.tmp/T026-smoke-results` | 工作区（隔离 profile） | 首次在受限沙箱内因 AppContainer 无法启动 Electron（`exitCode=2147483651`）；在沙箱外使用隔离 `.tmp/T024-smoke-*` profile 运行通过（1/1）。截图审查发现设置页额度百分比因继承 `align-self: center` 水平居中，已将跨行居中限定于 `.bubble-quota` 并重跑验证通过 |
| `git diff --check` | 工作区 | 通过 |

## 下一步

- 请用户审阅翻转后的两款 Gemini 形象、桌宠气泡（完整／简洁模式）及设置页视觉效果。
- 待确认后按授权范围决定是否提交或合并。
