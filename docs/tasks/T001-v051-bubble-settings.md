# T001：v0.5.1 气泡设置与页面调整

| 项目 | 当前记录 |
| --- | --- |
| 日期 | 2026-10-15（Asia/Shanghai） |
| 负责人 | Codex（本会话实现）；审查人待指定 |
| 关联需求 | [R001–R004](../REQUIREMENTS.md) |
| 状态 | 待审查；实现及本地验证通过，未提交、未合并、未远程发布 |
| 基准提交 | `b7ed57f9b8558a8569fade14b3feb27a40039825`（本地标签 `v0.5.0`） |
| 实现提交 | 未提交；不能以基准提交代表 v0.5.1 实现 |
| 分支 | 原实现发生于 `main`，早于本轮任务分支规范；T002 建分支时保留的修改目前同处 `docs/T002-project-guidance` 工作区，尚无独立 T001 实现分支 |
| 目标合并分支／目录 | `main`／`D:\desktop1\DesktopPlay` |
| 依赖 | 现有 v0.5.0 应用、已安装依赖与本地打包工具缓存；后续提交前需整理独立分支与变更归属 |

## 目标、范围和验收

实现气泡默认 3 秒收起、可保存的显示／悬浮延长时间、GPT 每周倒计时单行，以及白色设置页；验收条件见 R001–R004。

本记录由 T002 补建，仅保存原工作区中仍有效的实施事实；T002 的文档提交不包含或证明 T001 业务实现已经提交。下述 v0.5.1 文件与产物仍仅存在于原工作区。

已有未提交工作包括：`src/main/main.ts`、`src/main/services/desktop-service.ts`、`src/renderer/pet.ts`、`quota.css`、`settings.css`、`settings.ts`、`src/shared/defaults.ts`、`types.ts`，版本文件 `package.json`／`package-lock.json`，相关单元和 smoke 测试，`README.md`、`DESIGN.md`、`docs/release.md`、`docs/releases/v0.5.1.md` 及 `docs/previews/v0.5.1/`。`docs/PROJECT_STATE.md` 的当前状态整理与本任务记录由 T002 负责，不重复计入 T001 提交。

## 结果与重要决定

- 版本为 0.5.1；同步 package、锁文件根包与 `APP_VERSION`。
- `bubbleDurationSeconds` 为整数 1–60，默认 3；`bubbleHoverDelaySeconds` 为整数 0–60，默认 0／关闭。旧配置自动补齐默认值，主进程校验，设置随保存提交并在重启后保留。
- 点击／翻页重新计时，普通状态刷新不重新计时。开启延长时悬停保留，移开后按延长时间计时；角色切换确认等待用户决定。
- 紧凑倒计时使用 8.5px 字号、6px 列间距和单行排版；设置页固定白色及浅色控件，桌宠保持透明。
- 用原版／白龙演示数据验证排版，未读取真实账户。历史回归截图写入 `test-results/`，避免覆盖旧发行截图。

## 验证记录

对应对象：2026-10-15 本会话的 v0.5.1 未提交工作区，不是当前 HEAD 的已提交代码。以下为上一任务实际运行结果，T002 仅整理记录，没有重新运行或重新归因。

| 结果 | 检查 | 证据与限制 |
| --- | --- | --- |
| 通过 | `npm.cmd test` | 119 项单元测试；含旧配置迁移、时间边界、保存和重启恢复 |
| 通过 | `npm.cmd run build` | TypeScript、Vite、Electron main/preload 构建 |
| 通过 | `npm.cmd run test:smoke` | 7 项 Electron 测试；含三个人设计时、悬浮、草稿与持久化、完整倒计时及白色页面；在沙箱外启动测试 |
| 通过 | 截图与包内容核对 | 已查看新截图；`app.asar` 包版本为 0.5.1，含界面和 main/preload，没有用户配置 |
| 通过 | 使用下方本地缓存命令打包及 SHA-256 | 生成 Setup、Portable 及 `release/SHA256SUMS-0.5.1.txt`，同步 `SHA256SUMS.txt` |
| 失败 | 直接运行 `npm`；沙箱内 smoke | 分别受 `npm.ps1` 执行策略、Electron AppContainer ACL 限制；改用 `npm.cmd`、沙箱外隔离数据测试后通过，未关闭应用沙箱 |
| 失败 | 默认 `npm.cmd run dist` 下载／缓存路径 | 当前网络／缓存写权限限制；复用既有本地工具后打包通过，未更改生产打包配置 |
| 未运行 | 真实账户、真实安装覆盖升级／卸载、卸载 helper fixtures | 不属于本轮复验范围；单元或 Electron 交互测试不能替代真实安装卸载验收 |

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

1. 安全整理 T001 的独立实现分支和 T002 的文档变更，保留全部未提交文件；分别审查与提交，避免混合提交。
2. 提交／同步后重新运行受影响的验证，再依据明确授权决定是否推送、创建 PR 或发布标签。
3. 若后续涉及安装、卸载或额度协议，再安排对应的隔离环境与真实场景验证；现有历史卸载缺口见 [v0.5.0 说明](../releases/v0.5.0.md)。
