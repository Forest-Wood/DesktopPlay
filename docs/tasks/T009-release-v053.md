# T009：发布 DesktopPet v0.5.3

- 日期：2026-10-20（Asia/Shanghai）；负责人／整合负责人：Codex；需求 R012。
- 状态：PR #6 已合并，v0.5.3 标签已推送；Release #10 五资源已上传但转正接口失败，草稿保持非公开，正在修复恢复流程。
- 当前独立目录 `D:\desktop1\DesktopPlay-T009`；分支 `release/T009-v053`；目标 main。初始目录 `D:\desktop1\DesktopPlay` 保留，避免与原目录的分支操作相互影响。
- 基准 `101477afcb8a861289cd87d038519f64658046fb`，PR #5 合并提交；任务开始时 T008 工作区干净，原分支与旧标签保留。远端无 v0.5.3 标签／Release。
- 短路径修复 `67fb6ec`，发布准备交接 `9c618b0`，[PR #6](https://github.com/Forest-Wood/DesktopPlay/pull/6) 合并提交 `e71d83644bb6895a91129bd6700fe0d3c5ec7fec`；原分支／提交均保留。
- v0.5.3 annotated 标签对象 `dadaca0eb16f0ee6a3dbf1750de02edf81c65681`，解析到 `e71d836`；未移动标签。草稿 Release ID `418176374`。
- 授权：用户明确要求发布 0.5.3 Release，包含必要发布修复、验证、发布准备的提交／推送／整合、标签与 Release；不改写旧版本，不上传 TODO，不测试更新真实桌宠。

## 目标与范围

将已合并的软件内更新功能发布为 v0.5.3。版本三处保持 0.5.3，先核实主线和 CI，再创建新标签；沿用草稿上传五资源、校验后转正流程。公开 latest、两个 EXE、SHA256SUMS、latest.yml 和 NSIS blockmap 均需核对并提供下载。

发布前发现主线 CI #23（以及 PR #5 的 #21／#22）单测失败，不能沿用 T008 本地通过结论直接发布。失败四项集中在 update-files 的路径判断：Windows runner 的 TEMP 使用 `RUNNER~1` 8.3 名称，realpath 展开后与原字符串不同，被误判 UPDATE_PERMISSION，继而无法确认 Portable 回执。

最小修复保留逐级 lstat 的符号链接／junction 拦截；当 realpath 拼写不同，比较 bigint dev／ino 的文件身份，只有同一个普通文件才接受。新增回归覆盖同一物理文件别名、相同内容不同文件拒绝、junction 仍拒绝。未修改现有鼠标断言、账本逻辑、依赖或升级策略。

## 验证

- 通过：本地 `npm.cmd run build`（含类型），18 文件／194 单测；新增 3 个路径回归。
- 通过：[PR CI #25](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39394711099) 与 [main CI #26](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39395322494) 的完整检查，含 helper 与 Electron；发布提交树与通过 PR 的树完全一致。
- 通过：本轮重新执行独立两版本 NSIS／portable 升级及回滚，三场景均通过；证据 `.tmp/T008-upgrade-f6mOZf/results.json`，未触碰真实程序。
- 失败并已定位：[主线 CI #23](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39391816544) 为 187／191，四个更新相关用例失败于短路径；其他步骤被跳过，不能写成完整 CI 已通过。
- 保留：T008 的本地完整 Electron 12／13，原生鼠标页码未翻动与此前约 39px 偏移，未声称修复。既有账本偶发失败、真实 Work 与真实数据升级限制见 T008。
- 失败并定位：[Release #10](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39396018348) 单测、打包、元数据／依赖检查、五附件草稿上传均通过，最后按标签 GET 草稿返回 404，未正式发布。改为分页列出 releases 精确匹配 draft，仍逐一核对五文件名、大小、状态和摘要，全部一致才 PATCH 转正。
- 新增 workflow_dispatch 恢复入口：在主线读取修复后的 workflow，但 checkout 既有稳定标签作为打包源码；沿用同一 Release／tag，不移动 v0.5.3 或变更应用代码。仅允许稳定版本且必须匹配 package.json，已公开版本仍拒绝覆盖。
- 新增 8 个真实 PowerShell 门禁回归：单页／多页精确草稿可发布，缺附件、错误摘要／大小、重复草稿和已发布版本均不得转正。
- 待验证：恢复流程远端 CI、Release 重试、五附件公开下载与摘要。
- 未运行：真实用户数据覆盖升级、真实账户／Work 端到端、其他 Windows／ACL／UAC 组合；不借发布验证启动当前真实桌宠。

## 下一步

原目录在处理期间被切换到 main 并 pull；修复提交仍完整保留且从未推送到远端 main。创建独立 worktree，将本任务分支快进到 `67fb6ec` 后推送，PR #6 已核实正确包含修复；未回退原 main、未改写历史。后续从独立目录继续。

提交发布准备并推送 PR；检查远端完整 CI，通过后整合到 main，再创建并推送 v0.5.3 新标签。跟踪 Release，核实草稿门禁与五资源，更新发布结果及继承资料。下一编号 T010／R013。
