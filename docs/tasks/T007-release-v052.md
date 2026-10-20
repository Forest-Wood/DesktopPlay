# T007：发布 DesktopPet v0.5.2

- 日期：2026-10-20（Asia/Shanghai）；负责人／整合负责人：Codex；需求：R010。
- 状态：发布与附件核实已完成；版本准备已合并，最后交接记录保存在任务分支待审查。
- 工作目录：`D:\desktop1\DesktopPlay`；分支：`release/T007-v052`；目标：main。
- 基准：`e3a1f3d8345e78d7a51a2650e3f96f75a1190b59`，PR #3 合并提交；任务开始时原 T006 工作区干净，远程任务分支已在合并后删除，本地分支保留。
- 版本准备：`ac8e2e80453b206ad036f0254b7f74b88bb41e04`；[PR #4](https://github.com/Forest-Wood/DesktopPlay/pull/4) 已合并，发布提交 `34259f13837b52e641937fde6bc4cd168fc32c1f`。
- 标签：annotated `v0.5.2`，对象 `f1008fecb1f86f7d54acb2ccaa9aac63e96ba86c`，解析到上述发布提交；已通过远程引用核对。
- 依赖：PR #3 已合并、GitHub CI、既有 Release 工作流。下一个未分配编号 T008／R011。
- 授权与范围：用户反馈 Release 未更新，完成本阶段版本发布；限版本号、发布说明、管理状态及必要的发布操作，不改功能实现或依赖，不移动旧标签，不上传 TODO。

## 目标与验收

将已合并的重置卡、角色化 Codex／ChatGPT Work 提醒发布为 v0.5.2。版本三处一致，准备提交与发布提交可追溯；通过验证后整合版本准备并推送标签，自动产生两个 x64 EXE 和 SHA256SUMS.txt，核实最新正式 Release 与下载／校验记录。未运行的真实账户、Work 端到端和安装卸载检查单独标明。

## 当前事实与决定

- 开始时 PR #3 已于 2026-10-20 合并，远程 latest 仍为 v0.5.1、v0.5.2 标签不存在，原因是普通 PR 不触发 Release；工作流只监听 `v*` 标签，且要求标签版本等于 package.json。
- 新任务从最新 main 建立独立分支。同步 package.json、lock 根版本和 APP_VERSION 到 0.5.2，新增说明并清理已过时的未合并状态；功能代码沿用 PR #3。
- 只读匿名 Release 查询返回 403；改用本机已有 Git 认证通过官方 API 查询成功，认证仅在进程内使用，不输出或保存。沿用既有自动打包流程，不新增依赖或发布密钥。

## 验证

- 通过：仓库／分支／工作区、PR #3 合并、远程主线、现有 Release 和标签核对；三处版本（含 lock 根包）均为 0.5.2，构建主进程也包含正确版本。
- 通过：`npm.cmd test`，13 文件／156 项；`npm.cmd run build`（含类型检查）；`tests/helper-fixtures.ps1` 的 3 个必要文件系统场景通过，当前账号符号链接场景不可用，junction 场景通过。文档相对链接和差异检查通过。
- 失败：本机完整 Electron 11／12，原生鼠标用例横向偏差约 39.39px；单独复查仍失败（39px），属于 T006 已记录的问题；其他功能均通过，没有修改鼠标生产代码、断言或容差。远程 CI 结果另记，不能把本地完整回归写为通过。
- 通过：[PR CI #19](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39380484147) 及 [main CI #20](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39380733922) 全部 success，包含完整 Electron；版本准备与合并提交的 Git tree 完全一致。没有将本机鼠标失败写为已修复。
- 通过：[Release #9](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39381044349) completed／success；版本检查、单测、两个 EXE 打包、校验和及发布全部成功。
- 通过：正式 Release ID `418078168`，published_at `2026-10-20T06:34:48Z`（上海时间 14:34:48），非草稿／非预发布，latest 返回 v0.5.2。三个公开下载 HEAD 均 200，Content-Length 与 GitHub 附件大小一致。
- 通过：实际下载 199 字节 SHA256SUMS.txt，本机重算文件 SHA-256 与 GitHub digest 一致；两条 EXE 校验记录也与对应上传摘要一致。未完整下载两个 EXE，未声称在本机重算 EXE 内容。
- 未运行：本机重复打包；正式产物由远程 Release 构建。
- 未运行：真实账户、更新后的真实 Work 气泡端到端、安装覆盖升级／卸载、其他客户端版本；不是发布成功的替代验证。

## 下一步

发布已完成，下载入口为 [v0.5.2](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v0.5.2)。最后交接文档提交至本任务分支（提交号以 Git 历史为准），仅更新状态与验证证据，无遗留业务修改，不创建额外交接 PR 或移动发布标签。后续功能／修复另建任务；真实试用与安装验证继续明确保留为未运行。

## 正式附件

| 文件 | 字节数 | SHA-256 |
| --- | --- | --- |
| DesktopPet-0.5.2-Setup-x64.exe | 114758295 | `0b4653cf1b6fb42ff040324f18fc9a5e28c9d5d43ae07c2f7b59c6e80fe6f4b6` |
| DesktopPet-0.5.2-Portable-x64.exe | 114436497 | `49476a3f9086b623256c5e4cea8146fa52f61e985b86e7c8e87c51d0d1c56127` |
| SHA256SUMS.txt | 199 | `3b4e20f5a433730ebb39e19bf5527280d334b53c3bdf309ef27d38a954705f75` |

上述摘要以实际校验文件与 GitHub 附件 digest 交叉核对；EXE 未在本机运行，安装包身份和升级／卸载未据此标为验证通过。
