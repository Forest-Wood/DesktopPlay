# T038 · 人设工作室与其余设置页视觉统一

- 日期：2026-11-22（Asia/Shanghai）。
- 需求：[R041](../REQUIREMENTS.md#r041设置窗口与桌宠气泡前端重设计t034t041)。
- 负责人：Codex。
- 分支：`feat/T038-persona-studio`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准提交：`545a9a6`（`feat/T037-reminder-center` 的本地结果），远端 `main` 已核实为 `0d20d93`。
- 结果提交：未提交。
- 已有未提交修改：T037 的已验证改动已保存为上一分支的本地提交，本分支起始工作区干净。
- 本次未提交修改：伙伴昵称、工作室与设置页实现，相关单测、Electron 回归调整与交接文档。
- 状态：**已实现并通过本地验证，待审查**。

## 依赖

- 复用 [T035](T035-ui-foundation.md) 的导航和共享组件。

## 目标与范围

落地**人设工作室**（气泡／短句／音效按统一人设集中编辑），并同步完成**伙伴**（含可自定义修改昵称）、**账户**与**系统**（除 T040 调色盘外）页面的视觉统一。详细规格见 [UI_REDESIGN.md](../UI_REDESIGN.md#52-伙伴appearancebehavior)、[5.3 账户](../UI_REDESIGN.md#53-账户overviewcodexgeminirecords)、[5.5 人设工作室](../UI_REDESIGN.md#55-人设工作室bubblescompanionshipsound) 与 [5.6 系统](../UI_REDESIGN.md#56-系统paletteversionguidelicensesuninstall)。

### 实现

- **人设工作室**（`src/renderer/settings/views/studio.ts`，复用 `bubble-editor.ts`）：
  - 顶部统一人设条为 **DeepSeek、GPT、Gemini** 三项，使用真实素材缩略图。气泡、短句和音效共用当前人设。提醒矩阵的编辑入口选中桌面当前人设及对应完成场景，音效卡片保留当前工作室人设。
  - 气泡子页三栏布局（分组场景列表＋编辑表单＋右侧 `sticky` 实时预览），`<980px` 降级两栏、`<760px` 降级单栏；保留视觉隐藏的 `#bubble-scenario` 兼容层。
  - 短句子页左右分栏（可勾选列表＋N 与播放模式设置＋预览）；音效子页 6 槽位网格（按下、松开、4 来源完成音）及总开关／总音量。
- **伙伴页**（`src/renderer/settings/views/pet.ts`）：
  - DeepSeek、GPT、Gemini 卡片内可编辑四个档案的昵称，限 24 字符。首页、设置侧栏和桌宠无障碍名称使用保存后的昵称，清空时恢复默认昵称。
  - 造型缩略图条、完整／简洁两张模式示意卡（保留 `#pet-mode` 兼容控件）。缩放、置顶、吸附和开机启动集中在桌面行为卡。
- **账户页**（`src/renderer/settings/views/account.ts`）：统一“指标卡 → 操作区 → 折叠说明”三段结构。消费柱图按日期汇总最近 14 个观测日，不同币种各用一张图。表格按统计分段保留原口径，默认显示最近 14 行，也可展开全部。
- **系统页**（`src/renderer/settings/views/system.ts`）：版本页升级为版本卡（当前→最新、进度条、速率与 ETA、公告）；卸载页改为红色描边“危险操作区”。

## 兼容边界

- GPT 是工作室的一个导航入口，其下可在原版和白龙档案间切换。三个编辑页共用所选档案，原版、自定义图片和白龙仍按既有规则落盘，自定义图片使用原版 GPT 档案。无需迁移已有气泡、短句或音效文件。
- 伙伴昵称按 `whale`、`gpt`、`dragon`、`gemini` 独立保存。空值使用默认昵称，沿用既有设置 IPC。
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
| `npm.cmd run typecheck` | T038 工作区 | 通过 |
| `npm.cmd test` | T038 工作区 | 30 个文件、333 项通过，含昵称持久化、默认回退、校验、旧配置与失败更新原子性 |
| `npm.cmd run build` | T038 工作区 | 通过 |
| `npm.cmd run test:smoke -- --grep 'studio keeps\|custom audio import\|packaged renderer\|phrase controls\|local events use\|bubble editor preserves\|reminder matrix\|home opens\|settings exposes\|version routing\|Gemini skins\|T023 reminder' --output .tmp/T038-smoke/final` | Electron 开发构建、隔离配置 | 12 项通过。早期回归发现预览和视觉隐藏控件撑出滚动区域，修复后全部通过 |
| `npm.cmd run test:smoke -- persona-studio.spec.ts --output .tmp/T038-smoke/nicknames` | 最终 Electron 开发构建、隔离配置 | 通过。核对昵称同步、三页共享人设、草稿回退、图表展开和两种窗口尺寸。已目视检查 `.tmp/T038-smoke/nicknames/` 下的截图，气泡和角色均完整可见 |
| 真实账户、打包版更新与卸载 | — | 未运行，使用隔离配置和合成数据验证设置界面 |

## 临时文件滚动清理

已核对无 Git 跟踪项，删除 `.tmp/T036-smoke/` 和四张 `test-results/T036-home-*.png`。保留 T037、T038 验证产物和正式任务记录。

## 下一步

审查 T038 工作区。开展 [T039](T039-pet-bubble-refresh.md) 时接续 T038 的结果提交创建新分支。
