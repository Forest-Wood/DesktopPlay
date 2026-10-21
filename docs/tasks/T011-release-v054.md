# T011：发布 DesktopPet v0.5.4

- 日期：2026-10-22（Asia/Shanghai）；负责人：Codex；需求 R016；目标 main。
- 目录：`D:\desktop1\DesktopPlay`；分支：`release/T011-v054`；目标 main；基准 `fcf3f30a02f3221668a7e0acbeeb390d1f84cf41`（PR #10 合并）。发布准备 `912cc30` 经 [PR #11](https://github.com/Forest-Wood/DesktopPlay/pull/11) 合并为 `9be3fd6d10264fe9c0894cd2b31d73760c832a58`。
- 开始时 T010 工作区干净，无带入修改。用户明确要求发布新的 Release，授权本次版本准备、必要验证、提交／推送／整合、新标签和正式发布。
- 状态：v0.5.4 已于 2026-10-22 00:16:36（Asia/Shanghai）正式发布为 latest，Release ID `419779328`。开始时 latest 为 v0.5.3（Release `418176374`），无同版本标签或草稿；旧发布和标签保留。
- annotated 标签对象 `8fd341865ee565fe2fdc37ed80cc0df207eb4527`，解析到 `9be3fd6`；发布源码树与已通过 PR CI 的 `912cc30` 完全一致，没有改写历史。

## 范围与验收

将已合并的 DSH 提醒、三桌宠气泡档案和完成音效发布为下一个补丁版本 v0.5.4。同步 package、lock 根包与 APP_VERSION，更新发行说明；保持 appId、数据目录及现有升级方式。只提交本任务发布文件，不改功能实现、依赖或既有测试断言。

核对主线与发布准备 CI，创建匹配版本的新标签；使用现有 Release 工作流打包并上传两个 EXE、SHA256SUMS.txt、latest.yml、NSIS blockmap，逐一核实完整性后转为正式 latest。公开入口、大小与摘要需复核。不得用真实桌宠测试升级，不移动旧标签或覆盖旧公开附件。

## 验证与交付

- 已核实：[PR #10](https://github.com/Forest-Wood/DesktopPlay/pull/10) 合并到 `fcf3f30`，[PR CI #36](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39629868426) 与主线 [CI #37](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39631043773) 完整通过（含两个 helper 和 Electron）。
- 通过：本次 v0.5.4 工作区 `npm.cmd run build`（含类型检查）与 `npm.cmd test`（22 文件／223 单测，5.64 秒）。
- 通过：[发布准备 CI #38](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39632121271) 完整通过，包含两个 helper 和全部 Electron 测试。
- 通过：本地 `npm.cmd run dist -- --config.directories.output=.tmp/T011-packages`、`verify-release.mjs` 和 `verify-update-runtime.mjs`。两个 EXE 的 ProductVersion 均为 0.5.4，五资源元数据、SHA-256／SHA-512、运行依赖、固定发布源及 asar 内完成提示音检查通过；没有安装／运行真实桌宠。
- 辅助检查曾因 Windows PowerShell 5 不支持 lock 的空键、asar 使用错误路径分隔符失败；分别改用 Node JSON 解析和平台路径后通过，未改生产代码或断言。
- 通过：[Release #13](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39632962647) 完整自动发布成功，含标签／版本校验、223 单测、构建打包、运行依赖和更新元数据检查、五附件草稿上传、逐一核对状态／大小／GitHub SHA-256 digest 后转正式 latest。本轮没有人工转正或替换附件；既有草稿恢复分支被跳过，仍未实测。
- 通过：[主线 CI #39](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39632936724) 完整通过，包含两个 helper 和全部 Electron 测试。
- 通过：2026-10-22 00:20（Asia/Shanghai）从公开下载地址完整下载五附件，均 HTTP 200，逐一核对字节数和 GitHub SHA-256 digest；SHA256SUMS 与两 EXE 摘要一致，latest.yml 的版本／安装文件名／大小／SHA-512 一致。正式 latest、非草稿／非预发布及远程 annotated tag 指向均复核一致。发行说明通过发布者 API 补齐，未替换任何附件。
- GitHub 插件合并接口返回 403（Resource not accessible by integration），改用现有 Git 认证调用官方 API 整合，凭据仅在内存，不写入文件／应用／输出。
- 保留限制：T010 本地完整 Electron 15/16，原生鼠标偏移用例原样重试通过，未解决根因；真实账户、DSH／Work 端到端及真实用户数据覆盖升级未运行。本次不修改更新器实现，不重复独立两版本升级实验。

## 正式附件

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| DesktopPet-0.5.4-Portable-x64.exe | 114823286 | `4fbce29f7b3d1549dda5d22a4ec5fea301b4d995fecaeb9108616aea4e63a93c` |
| DesktopPet-0.5.4-Setup-x64.exe | 115145077 | `d20acabef12a295322a9a0f6e8af5739d7d13777a7a57a78c885c0df4c31c519` |
| DesktopPet-0.5.4-Setup-x64.exe.blockmap | 121044 | `a894bd95269d6fb97b65ca25c1c0ac2620a8925095e904a9020653a0ececeef7` |
| latest.yml | 357 | `b07da8a7af0091379f467f47ef7b13f825137605c5772d1b4cf19c044c5f1fcf` |
| SHA256SUMS.txt | 197 | `5e84c4ad1c3293ba6371e77d18c90f8148b640ce0af6e955241eb1fa8711ae22` |

本地完整下载／交叉校验证据在忽略的 `.tmp/T011-published-verification.json`、`.tmp/T011-published/`，本地打包在 `.tmp/T011-packages/`；这些文件不提交，不把本地包摘要冒充远程发布包摘要。公开可复核信息以上表及正式 Release 为准。

发布已完成：[v0.5.4](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v0.5.4)。下一步仅交接文档整合；不对同版本重跑发布，不移动标签或覆盖附件。后续独立任务 T012／R017；已有草稿上传恢复路径与真实客户端／真实数据验证限制继续保留。
