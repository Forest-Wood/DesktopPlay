# T022：桌宠工作台界面与设置归类

- 日期：2026-11-05 开始，2026-11-06 收尾（Asia/Shanghai）。
- 需求：[R029](../REQUIREMENTS.md#r029桌宠工作台界面与设置归类t022)。
- 负责人：Codex；并行只读审查与测试迁移使用独立工作目录。
- 分支：`feat/T022-companion-ui`；目标合并分支：`main`。
- 工作目录：`D:\desktop1\DesktopPlay`。
- 基准：`cc318beab5b92e59107983a5d8751b2511a83b98`，2026-11-05 `git ls-remote` 与 fetch 核实；该提交已合并 T021 / PR #24。
- 状态：实现及针对性验证完成；2026-11-12 用户授权与 T023 一起提交、推送、创建 PR，待审阅；不合并、不发布。结果提交与 PR 见文末交接。
- 开始时工作区干净，原分支为 `feat/T021-whale-period-cleanup`；当时新增修改均属于本任务；2026-11-12 合入的 T023 增量另记。

## 目标与范围

结合用户指定的 [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) 和现有桌宠行为，改进设置工作台。用户随后明确允许调整功能位置，使设置更方便、直观。

范围：renderer 设置外壳、导航归类、提醒卡片、气泡编辑器内部跳转、样式、相关 smoke 和设计／使用文档。依赖现有 TypeScript DOM、CSS、Electron、Vite 与真实角色素材；不新增包、IPC、持久化字段，不更改真实用户配置、版本或发行文件。

## 设计与实现

- 实际阅读参考仓库中的 [Claude](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/claude/DESIGN.md) 与 [Notion](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/notion/DESIGN.md) 分析，借鉴暖中性色、淡色卡片和克制的层次。它们是社区对营销页面的分析，不视为官方设计规范；本项目保留原有身份和 Windows 字体。
- 白色正文、浅鼠尾草导航、松绿操作色、暖色消费卡；当前桌宠用真实素材呈现，角色舞台随 GPT／白龙变化。图标采用统一线性 SVG。集中样式在 `settings-workspace.css`，保留原有专用编辑器基础样式。
- 导航按任务归类：我的桌宠（角色与模式／桌面行为／短句）、账户与用量（DeepSeek／Codex／记录）、提醒与声音（对话／余额／声音）、气泡与文案、关于。
- 同一来源的完成与等待开关放在一张卡片里；目录、hook 和长说明按需展开，状态持续可见。保留输入 ID、name、form 关联和即时／保存后生效的原有边界。
- 伙伴卡可直达角色页；模式移至角色预览下方。账户页直达记录与余额提醒，声音页直达选定角色／来源的完成音效，气泡页可返回提醒与声音。跳转同步键盘焦点，跨页停止试听。
- 已保存模式与未保存草稿分开显示；固定保存栏以状态点和文字提示。保留 `modeDirty`、`draftRevision` 及保存竞态处理。
- 默认和最小窗口下单区滚动、底部保存常驻；长角色名限制两行并提供完整 title，侧栏可滚动兜底。额度样式限定于账户页，避免泄漏到真实气泡预览；宽窗口预览从编辑区顶部并排显示。

## 验收与验证

所有 Electron 检查使用隔离测试 profile、`DESKTOPPLAY_TEST_NO_CODEX=1`，未读取真实账户、会话或修改真实 hook。

| 检查 | 结果与边界 |
| --- | --- |
| `npm.cmd run build` | 最终实现通过，包含 TypeScript 检查、Vite 与 Electron 构建 |
| `npm.cmd test` | 28 文件、317 项通过；之后仅微调角色／声音跳转和视图位置，受影响部分由下述 UI 回归验证 |
| `npm.cmd run test:smoke` | 25 项中 24 项通过；一项原生鼠标按住位置不变测试失败，详见下段 |
| 最终定向 Electron | `desktop.spec.ts`、`pet-mode.spec.ts`、`persona-notifications.spec.ts` 排除已复现的原生指针用例，12/12 通过；覆盖声音、跨页草稿、模式、角色、目录、文案、持久化、预览、快捷入口与焦点 |
| 浏览器视觉与交互 | `.tmp/T022-visual.mjs` 使用独立 Edge context 和现有 demo API；14 子页 × 1060×800 / 760×560 共 28 组检查通过，无页面错误、横向溢出、全局纵向溢出或保存栏遮挡 |
| 截图审查 | 查看账户、Codex、角色、提醒、气泡编辑器及小窗口截图；均为虚构 demo 数据。输出 `test-results/T022-design/` |
| `git diff --check` | 通过；Git 的 CRLF→LF 提示不是检查失败 |

原生指针限制：`desktop.spec.ts` 的 `real held pointer presses preserve all mirror poses and cancel without paging` 在全量运行中出现 18 DIP 偏移，单项复测约 39.39 DIP；在独立工作目录 `D:\desktop1\.t022-ui-tests` 使用基准 `cc318be` 的原始应用源码重新构建，同一未修改用例也出现 40 DIP 偏移。初期定向测试该项曾通过，不能据此宣称已解决。该问题与历史原生鼠标偏移现象一致，但根因仍未确认；本次没有修改桌宠拖拽、命中区域或主进程逻辑。

最终定向命令：

```powershell
npm.cmd run test:smoke -- tests/smoke/desktop.spec.ts tests/smoke/pet-mode.spec.ts tests/smoke/persona-notifications.spec.ts --grep-invert 'real held pointer' --output test-results/T022-final
```

失败 trace 保留于主目录 `test-results/desktop-real-held-pointer--50f93-s-and-cancel-without-paging/`、`test-results/T022-pointer-retry/`，基准对照位于独立工作目录 `test-results/T022-baseline-pointer/`。独立目录通过 node_modules junction 复用依赖，只用于测试迁移和基准对照。

## 后续

用户可通过本地 Vite 演示 `http://127.0.0.1:5173/?view=settings` 审阅布局；演示不连接真实账户。当前构建包含新界面，现有已发布安装包仍为原 v1.1.0。后续提交、PR 或发行按用户授权执行；原生鼠标问题单独诊断，不以放宽断言掩盖。
