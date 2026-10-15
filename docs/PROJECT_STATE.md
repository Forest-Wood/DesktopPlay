# DesktopPet 当前项目状态

更新日期：2026-10-15（Asia/Shanghai）。**v0.5.1 已正式发布并成为最新 Release**。约定见 [AGENTS.md](../AGENTS.md)，验收见 [需求登记](REQUIREMENTS.md)，详细证据见任务记录。

## 仓库与发布

| 项目 | 当前事实 |
| --- | --- |
| 工作目录／本地记录分支 | `D:\desktop1\DesktopPlay`／`release/T003-v051` |
| 发布提交 | `979764a596e3c4f639d09db53ce8f0f879104981`，PR #2 合并提交；版本三处均为 0.5.1 |
| 标签 | annotated v0.5.1 已推送，解析到发布提交；没有移动或覆盖已有标签 |
| 主线验证 | [main CI #15](https://github.com/Forest-Wood/DesktopPlay/actions/runs/38716301473) completed／success |
| 发布验证 | [Release #8](https://github.com/Forest-Wood/DesktopPlay/actions/runs/38716954486) completed／success，测试、打包、校验和与发布步骤全部通过 |
| 发布页面 | [DesktopPet v0.5.1](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v0.5.1)，公开、非草稿、非预发布，latest API 已返回本版本 |

| 任务 | 状态 | 结果 |
| --- | --- | --- |
| [T001：气泡与页面调整](tasks/T001-v051-bubble-settings.md) | 已合并 | R001–R004；[PR #2](https://github.com/Forest-Wood/DesktopPlay/pull/2) 已合并，0.5.1 功能进入 main |
| [T002：协作与交接规范](tasks/T002-project-guidance.md) | 已合并 | R005；[PR #1](https://github.com/Forest-Wood/DesktopPlay/pull/1) 已合并 |
| [T003：发布 v0.5.1](tasks/T003-release-v051.md) | 待审查（发布已完成） | R006；标签、正式 Release、三个附件及校验记录均已核实；仅本地交接记录待审查 |

下一编号为 T004／R007，分配前核实占用。T003 没有业务代码或工作流修改；发布记录保存在本地 release/T003-v051 分支，记录提交见 Git 历史，该记录分支未推送、未创建额外 PR。已发布标签始终指向通过 CI 的合并提交；不为同步文档向 main 直接推送。

## 已核实的正式附件

- `DesktopPet-0.5.1-Setup-x64.exe`：114742420 字节。
- `DesktopPet-0.5.1-Portable-x64.exe`：114420691 字节。
- `SHA256SUMS.txt`：199 字节。

三个公开下载地址均返回 HTTP 200，Content-Length 与 GitHub 元数据一致。已实际下载校验文件，计算并核对其摘要；两条 EXE 校验记录与 GitHub 上传摘要一致。完整 SHA-256 和验证范围见 T003。此前本地 release/ 的预构建文件仅为历史验证样本，正式下载与校验使用 GitHub 附件。

## 当前有效定位与限制

- 气泡默认 3 秒；显示／悬浮延长时间可保存；GPT 倒计时单行、设置页白色。实现和本地验证见 T001，发行变化见 [v0.5.1](releases/v0.5.1.md)。
- 产品名 DesktopPet，兼容 appId 与 `%APPDATA%\DesktopPlay` 数据目录沿用。主进程设置校验、旧配置默认值和持久化测试已覆盖本次改动。
- 环境和命令统一维护在 AGENTS.md。此前本机 Electron GPU／AppContainer 限制及测试软件渲染替代方式见 T001，不据本机限制推断远程 CI 失败。

## 验证结果与下一步

| 结果 | 范围 | 说明 |
| --- | --- | --- |
| 通过 | 发布前检查 | PR #2 merged、main、版本三处、验证树与精确标签提交均一致 |
| 通过 | 远程 CI／Release | CI #15 与 Release #8 成功；公开最新版本和三个附件均核实 |
| 通过 | 下载响应与校验记录 | 三个附件 HTTP 200／大小匹配；校验文件实际下载且摘要匹配，EXE 记录与 GitHub digest 一致 |
| 未运行 | 本轮重复本地 build／smoke／打包、EXE 全文下载后重算摘要、真实账户／安装卸载 | 本轮无业务代码修改；未将公开附件或 CI 通过表述为真实安装卸载验收 |

发布操作已完成；下一步仅为审查本地发布交接记录。新的业务功能或修复另建任务，不移动 v0.5.1 标签。历史真实账户／安装卸载限制继续按相关任务记录保留。
