# T003：发布 DesktopPet v0.5.1

| 项目 | 当前记录 |
| --- | --- |
| 日期 | 2026-10-15（Asia/Shanghai） |
| 负责人 | Codex（本会话）；发布验证已完成，交接记录待审查 |
| 关联需求 | [R006](../REQUIREMENTS.md#r006v051-发布) |
| 状态 | 待审查（发布已完成）；没有额外业务代码改动 |
| 分支／目标 | `release/T003-v051`；记录基于 main，不向已合并的 T001 分支追加工作 |
| 工作目录 | `D:\desktop1\DesktopPlay` |
| 基准与发布提交 | `979764a596e3c4f639d09db53ce8f0f879104981`，PR #2 合并提交 |
| 标签 | `v0.5.1`，annotated；标签对象 `a269ccd17d64c9c66f2225678a7e3c69458d679d`，解析后为上述发布提交 |
| 记录提交 | 发布记录保存在本地 release/T003-v051，提交号见 Git 历史；未推送该记录分支或创建额外 PR，不影响已发布标签 |
| 依赖 | PR #2 已合并，main CI #15 成功，Release 工作流和 GitHub 下载服务 |

## 目标、范围与验收

根据用户“继续”的发布授权，将已合并的 0.5.1 发布到 GitHub Releases。验收见 R006。范围限于版本／提交核对、标签推送、既有自动发布流程及附件验证；不改业务代码、依赖或工作流，不重建或移动已存在的标签。

文档同步范围为本任务记录、PROJECT_STATE、需求状态、T001 合并状态及 v0.5.1 发行说明的发布状态。源码标签仍指向已通过 CI 的合并提交，后续记录提交不混入发行代码。

## 已核实的决定与状态

- 开始时工作区干净，位于 T001 功能分支；已 fetch 最新 origin/main，核实其为发布提交，PR #2 为 merged。
- package、锁文件根包与 APP_VERSION 均为 0.5.1；发布提交与已验证功能分支 fdf5537 的 Git tree 一致。
- 发布前远程只有 v0.5.0 系列标签，没有 v0.5.1。创建本任务分支后，在精确合并提交创建 annotated 标签并仅推送该标签，没有强制推送或改写主线。
- [main CI #15](https://github.com/Forest-Wood/DesktopPlay/actions/runs/38716301473) 和标签触发的 [Release #8](https://github.com/Forest-Wood/DesktopPlay/actions/runs/38716954486) 均为 completed／success。Release 的版本核对、单测、打包、校验和及发布步骤全部成功。
- [正式 v0.5.1](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v0.5.1) 已发布，Release ID 为 413656564，published_at 对应上海时间 2026-10-15 18:01:24。非草稿、非预发布；`releases/latest` 也返回本版本。

## 验证记录

| 结果 | 检查 | 证据与限制 |
| --- | --- | --- |
| 通过 | PR、main、版本与工作区检查 | PR #2 合并，工作区干净，版本三处为 0.5.1，发布树与验证树一致 |
| 通过 | 远程标签核对 | tag 对象与解析后的发布提交均已通过 git ls-remote 核实 |
| 通过 | main CI #15 | completed／success，针对精确发布提交 |
| 通过 | Release #8 | 单测、Windows x64 两种打包、校验和及自动发布步骤全部 success |
| 通过 | Release／latest API | v0.5.1 公开、非草稿、非预发布，三个附件均为 uploaded，且为最新 Release |
| 通过 | 三个附件的下载响应与大小 | 所有公开下载 URL 的 HEAD 返回 200，Content-Length 与 API size 一致，见下表 |
| 通过 | 校验文件下载及摘要 | 实际下载 199 字节 SHA256SUMS.txt，计算其 SHA-256 与 GitHub digest 一致；其中两条 EXE 记录与 GitHub 对应附件 digest 一致 |
| 未运行 | 本轮本地重复 build／smoke／打包、真实账户、真实安装卸载 | 无业务代码变化；本轮使用已成功的 main CI 和新的远程 Release 构建，不扩大真实账户或安装卸载范围 |
| 未运行 | 两个 EXE 完整下载后在本机重新计算摘要 | 本轮核对公开下载响应和 GitHub 上传摘要与校验文件的一致性，没有将其表述为本机重算 EXE 内容 |

## 正式附件

| 文件 | 字节数 | SHA-256（与 GitHub 附件 digest 一致） |
| --- | --- | --- |
| DesktopPet-0.5.1-Setup-x64.exe | 114742420 | `31ba826b71389cf3c8060107802acb01fb53aca464f97c3a47accdaf54c40f4b` |
| DesktopPet-0.5.1-Portable-x64.exe | 114420691 | `6deed6dc62c1b769e697ba0cdfc580a25c962953ac8b392ad0f8c9a5955b4c3c` |
| SHA256SUMS.txt | 199 | `ec4f2ad80b851be1cea234d324711ac435099ef37927a81553bf664a7a0ce5af` |

正式下载入口为上述 Release 页面；本机 `release/` 中的旧预构建文件仅为历史验证产物，正式附件与校验以 GitHub 本次发布为准。

## 下一步

发布操作和附件核实已完成。交接文档保留在本地记录分支待审查；后续业务改动另建任务，不移动已发布的 v0.5.1 标签。没有为记录同步擅自向 main 推送或创建额外 PR。
