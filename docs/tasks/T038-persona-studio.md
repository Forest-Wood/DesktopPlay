# T038 · 人设工作室与其余设置页视觉统一

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R041](../REQUIREMENTS.md#r041设置窗口与桌宠气泡前端重设计t034t041)。
- 负责人：待定（开工前确认）。
- 分支：`feat/T038-persona-studio`（建议）；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：待 T035 合入后核实最新 `origin/main`（可与 T036/T037 按合并顺序协调）。
- 结果提交：未提交。
- 已有未提交修改：开工前核实工作区状态。
- 状态：**待开发**。

## 依赖

- 依赖 [T035](T035-ui-foundation.md) 已完成并合入。

## 目标与范围

落地**人设工作室**（气泡／短句／音效按统一人设集中编辑），并同步完成**伙伴**（含可自定义修改昵称）、**账户**与**系统**（除 T040 调色盘外）页面的视觉统一。详细规格见 [UI_REDESIGN.md](../UI_REDESIGN.md#52-伙伴appearancebehavior)、[5.3 账户](../UI_REDESIGN.md#53-账户overviewcodexgeminirecords)、[5.5 人设工作室](../UI_REDESIGN.md#55-人设工作室bubblescompanionshipsound) 与 [5.6 系统](../UI_REDESIGN.md#56-系统paletteversionguidelicensesuninstall)。

### 计划改动清单

- **人设工作室**（`src/renderer/settings/views/studio.ts`，复用 `bubble-editor.ts`）：
  - 顶部统一人设条为 **Deepseek（原小鲸鱼）、GPT（合并原版 GPT 与白龙）、Gemini** 三项，使用真实素材缩略图；三个二级标签（气泡 · 短句 · 音效）共用同一当前人设。
  - 气泡子页三栏布局（分组场景列表＋编辑表单＋右侧 `sticky` 实时预览），`<980px` 降级两栏、`<760px` 降级单栏；保留视觉隐藏的 `#bubble-scenario` 兼容层。
  - 短句子页左右分栏（可勾选列表＋N 与播放模式设置＋预览）；音效子页 6 槽位网格（按下、松开、4 来源完成音）及总开关／总音量。
- **伙伴页**（`src/renderer/settings/views/pet.ts`）：
  - 3 角色大卡片（角色名 Deepseek／GPT／Gemini），将“小鲸鱼”、“原版 GPT”、“白龙”（及 Gemini 默认昵称）改为**可内联编辑的自定义昵称**（空值回退默认昵称；同步 `src/shared/types.ts`、`defaults.ts`、主进程白名单校验与旧配置兼容、`demo.ts`）。
  - 造型缩略图条、完整／简洁两张模式示意卡（保留 `#pet-mode` 兼容控件）及合并后的桌面行为卡。
- **账户页**（`src/renderer/settings/views/account.ts`）：统一“指标卡 → 操作区 → 折叠说明”三段结构；消费记录表格上方增加纯 CSS/SVG 按日柱图，默认显示最近 14 行并可展开全部。
- **系统页**（`src/renderer/settings/views/system.ts`）：版本页升级为版本卡（当前→最新、进度条、速率与 ETA、公告）；卸载页改为红色描边“危险操作区”。

## 兼容边界

- 确认 GPT 合并人设在持久化 `bubbleProfilesByPersona`／短句／音效中的映射与旧配置迁移策略（如原版 GPT 与白龙既有自定义配置如何平滑兼容），开工前在任务记录中明确。
- 新增伙伴昵称持久化字段提供默认值、长度与字符校验、非法输入原子拒绝及旧配置补默认值；不新增 IPC。
- 保留既有 smoke 控件 id：`bubble-scenario`、`phrase-count`、`sound-choose-press`、`pet-mode`、`select-gpt`、`api-key`、`codex-quotas`、`gemini-quotas` 等。

## 验收条件

1. 伙伴昵称编辑、空值回退、主进程校验与旧配置兼容单测通过。
2. 气泡、短句、音效、伙伴、账户相关 smoke 全部通过；草稿跨页保存与放弃恢复正常。
3. 实时预览在 `1060×800` 与 `760×560` 下不裁切、无横向溢出。
4. `npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run build` 通过。
5. 完成时清理 `T036` 的非跟踪临时测试产物（按 `T(N-2)` 规则）。

## 验证

| 检查 | 适用 | 结果 |
| --- | --- | --- |
| `npm.cmd run typecheck` | — | 未运行 |
| `npm.cmd test` | — | 未运行 |
| `npm.cmd run build` | — | 未运行 |
| 气泡／短句／音效／伙伴相关 smoke 与截图核对 | — | 未运行 |

## 下一步

1. T035 合入后切出 `feat/T038-persona-studio`。
2. 先确定 GPT 合并人设的旧配置兼容规则与昵称持久化字段定义，再逐页实现并验证。
