# T001：v0.5.1 气泡设置与页面调整

| 项目 | 当前记录 |
| --- | --- |
| 日期 | 2026-10-15（Asia/Shanghai） |
| 负责人 | Codex（本会话实现）；审查人待指定 |
| 关联需求 | [R001–R004](../REQUIREMENTS.md) |
| 状态 | 待审查；实现及本轮复验通过，已提交推送并创建 PR，未合并、未发布 Release |
| 基准提交 | 原业务基准 `b7ed57f9b8558a8569fade14b3feb27a40039825`（v0.5.0）；功能分支基准 `7ac1192094636ac09334d79c40412bc64598b2bb`（已合并 T002） |
| 实现提交 | `f5a78fac3d5d982afc4edb69721fe98af142d753`；后续交接同步提交见本文件 Git 历史 |
| PR | [#2：v0.5.1 气泡时间设置与界面调整](https://github.com/Forest-Wood/DesktopPlay/pull/2)，open，目标 main |
| 分支 | `feat/T001-bubble-settings`，从最新 `origin/main` 创建；原实现曾在 main／T002 工作区保留，本轮已独立整理 |
| 目标合并分支／目录 | `main`／`D:\desktop1\DesktopPlay` |
| 依赖 | 现有 v0.5.0 应用、已安装依赖与本地打包工具缓存；T002 的管理规范已通过 PR #1 合并到主线 |

## 目标、范围和验收

实现气泡默认 3 秒收起、可保存的显示／悬浮延长时间、GPT 每周倒计时单行，以及白色设置页；验收条件见 R001–R004。

本记录由 T002 补建，本轮随 T001 功能实现同步。T002 的文档 PR 不包含本任务的业务实现；本任务单独提交、推送和创建功能 PR。安装包保持为被忽略的本地产物。

本次范围包括：`src/main/main.ts`、`src/main/services/desktop-service.ts`、`src/renderer/pet.ts`、`quota.css`、`settings.css`、`settings.ts`、`src/shared/defaults.ts`、`types.ts`，版本文件 `package.json`／`package-lock.json`，相关单元和 smoke 测试，`README.md`、`DESIGN.md`、`docs/release.md`、[v0.5.1 发行说明](../releases/v0.5.1.md)及 `docs/previews/v0.5.1/`。同步更新需求、当前交接和任务记录，其中 T002 记录仅修正为已核实的合并状态，不修改已合并的指南或模板。

## 结果与重要决定

- 版本为 0.5.1；同步 package、锁文件根包与 `APP_VERSION`。
- `bubbleDurationSeconds` 为整数 1–60，默认 3；`bubbleHoverDelaySeconds` 为整数 0–60，默认 0／关闭。旧配置自动补齐默认值，主进程校验，设置随保存提交并在重启后保留。
- 点击／翻页重新计时，普通状态刷新不重新计时。开启延长时悬停保留，移开后按延长时间计时；角色切换确认等待用户决定。
- 紧凑倒计时使用 8.5px 字号、6px 列间距和单行排版；设置页固定白色及浅色控件，桌宠保持透明。
- 用原版／白龙演示数据验证排版，未读取真实账户。历史回归截图写入 `test-results/`，避免覆盖旧发行截图。

## 验证记录

对应对象：2026-10-15 本任务的 v0.5.1 功能实现。同步最新主线后，本轮重新运行类型／生产构建、119 项单元测试及 7 项 Electron 测试通过。安装包验证沿用前次同一业务实现的实际结果，本轮不重复打包。

| 结果 | 检查 | 证据与限制 |
| --- | --- | --- |
| 通过 | `npm.cmd test` | 119 项单元测试；含旧配置迁移、时间边界、保存和重启恢复 |
| 通过 | `npm.cmd run build` | TypeScript、Vite、Electron main/preload 构建 |
| 通过 | 设置 `DESKTOPPLAY_TEST_SOFTWARE_RENDERING=1` 后运行 `npm.cmd run test:smoke` | 本轮 7 项 Electron 测试通过；含三个人设计时、悬浮、草稿与持久化、完整倒计时及白色页面；沙箱外、独立配置、禁用真实 Codex |
| 通过 | 截图与包内容核对 | 已查看新截图；`app.asar` 包版本为 0.5.1，含界面和 main/preload，没有用户配置 |
| 通过 | 使用下方本地缓存命令打包及 SHA-256 | 生成 Setup、Portable 及 `release/SHA256SUMS-0.5.1.txt`，同步 `SHA256SUMS.txt` |
| 通过 | 提交、推送和功能 PR 创建 | 26 个任务文件经暂存范围、版本一致性和提交树链接检查后提交；分支已推送，PR #2 已创建；安装包未进入 Git |
| 失败 | 直接运行 `npm`；沙箱内 smoke | 分别受 `npm.ps1` 执行策略、Electron AppContainer ACL 限制；改用 `npm.cmd`、沙箱外隔离数据测试后通过，未关闭应用沙箱 |
| 失败 | 默认 `npm.cmd run dist` 下载／缓存路径 | 当前网络／缓存写权限限制；复用既有本地工具后打包通过，未更改生产打包配置 |
| 失败（替代方式通过） | 本轮默认 GPU 下完整 smoke | 多个原有用例等待点击稳定或截图时超时，初次运行中止；隔离诊断观察到帧停止，仅增加测试用 `--disable-gpu` 后点击诊断与 7 项完整回归通过 |
| 未运行 | 真实账户、真实安装覆盖升级／卸载、卸载 helper fixtures | 不属于本轮复验范围；单元或 Electron 交互测试不能替代真实安装卸载验收 |

本机 GPU 渲染异常时可使用测试专用选项；`tests/smoke/electron-args.ts` 仅在该变量为 1 时增加 `--disable-gpu`，正常应用与默认 CI 参数不变：

```powershell
$env:DESKTOPPLAY_TEST_SOFTWARE_RENDERING = '1'
npm.cmd run test:smoke
```

本地缓存打包命令（先核实这些路径仍存在）：

```powershell
$env:ELECTRON_BUILDER_NSIS_DIR = Join-Path $PWD '.tmp\nsis'
$env:ELECTRON_BUILDER_NSIS_RESOURCES_DIR = Join-Path $PWD '.tmp\nsis-resources'
$env:ELECTRON_BUILDER_7ZIP_PATH = Join-Path $PWD '.tmp\7zip\bin\7za.exe'
$env:ELECTRON_BUILDER_CACHE = Join-Path $PWD '.tmp\builder-cache-v051'
npm.cmd run build
& '.\node_modules\.bin\electron-builder.cmd' --win nsis portable --x64 --publish never --config.electronDist=node_modules/electron/dist
```

产物为 `release/DesktopPet-0.5.1-Setup-x64.exe` 与 `release/DesktopPet-0.5.1-Portable-x64.exe`，目录被 Git 忽略。本地包不代表 GitHub Release 已发布。

## 下一步

1. 等待 [PR #2](https://github.com/Forest-Wood/DesktopPlay/pull/2) 审查和 CI，后续修订继续使用 feat/T001-bubble-settings。
2. 未获得合并或发布授权，本次不自动合并、不创建发行标签或发布 Release；CI 结论以 PR 最新检查为准，未据本地通过推定远程通过。
3. 若后续涉及安装、卸载或额度协议，再安排对应的隔离环境与真实场景验证；现有历史卸载缺口见 [v0.5.0 说明](../releases/v0.5.0.md)。
