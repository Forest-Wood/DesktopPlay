# T009：发布 DesktopPet v0.5.3

- 日期：2026-10-20（Asia/Shanghai）；负责人／整合负责人：Codex；需求 R012。
- 状态：发布准备 [PR #6](https://github.com/Forest-Wood/DesktopPlay/pull/6) 已创建，等待完整 CI；尚未创建 v0.5.3 标签或正式 Release。
- 当前独立目录 `D:\desktop1\DesktopPlay-T009`；分支 `release/T009-v053`；目标 main。初始目录 `D:\desktop1\DesktopPlay` 保留，避免与原目录的分支操作相互影响。
- 基准 `101477afcb8a861289cd87d038519f64658046fb`，PR #5 合并提交；任务开始时 T008 工作区干净，原分支与旧标签保留。远端无 v0.5.3 标签／Release。
- 修复提交：`67fb6ec`；后续交接仅文档。本轮开始无既有修改，未丢弃任何原分支或提交。
- 授权：用户明确要求发布 0.5.3 Release，包含必要发布修复、验证、发布准备的提交／推送／整合、标签与 Release；不改写旧版本，不上传 TODO，不测试更新真实桌宠。

## 目标与范围

将已合并的软件内更新功能发布为 v0.5.3。版本三处保持 0.5.3，先核实主线和 CI，再创建新标签；沿用草稿上传五资源、校验后转正流程。公开 latest、两个 EXE、SHA256SUMS、latest.yml 和 NSIS blockmap 均需核对并提供下载。

发布前发现主线 CI #23（以及 PR #5 的 #21／#22）单测失败，不能沿用 T008 本地通过结论直接发布。失败四项集中在 update-files 的路径判断：Windows runner 的 TEMP 使用 `RUNNER~1` 8.3 名称，realpath 展开后与原字符串不同，被误判 UPDATE_PERMISSION，继而无法确认 Portable 回执。

最小修复保留逐级 lstat 的符号链接／junction 拦截；当 realpath 拼写不同，比较 bigint dev／ino 的文件身份，只有同一个普通文件才接受。新增回归覆盖同一物理文件别名、相同内容不同文件拒绝、junction 仍拒绝。未修改现有鼠标断言、账本逻辑、依赖或升级策略。

## 验证

- 通过：本地 `npm.cmd run build`（含类型），18 文件／194 单测；新增 3 个路径回归。
- 失败并已定位：[主线 CI #23](https://github.com/Forest-Wood/DesktopPlay/actions/runs/39391816544) 为 187／191，四个更新相关用例失败于短路径；其他步骤被跳过，不能写成完整 CI 已通过。
- 保留：T008 的本地完整 Electron 12／13，原生鼠标页码未翻动与此前约 39px 偏移，未声称修复。既有账本偶发失败、真实 Work 与真实数据升级限制见 T008。
- 待验证：修复后的远端 CI、Release 构建、五附件公开下载与摘要。
- 未运行：真实用户数据覆盖升级、真实账户／Work 端到端、其他 Windows／ACL／UAC 组合；不借发布验证启动当前真实桌宠。

## 下一步

原目录在处理期间被切换到 main 并 pull；修复提交仍完整保留且从未推送到远端 main。创建独立 worktree，将本任务分支快进到 `67fb6ec` 后推送，PR #6 已核实正确包含修复；未回退原 main、未改写历史。后续从独立目录继续。

提交发布准备并推送 PR；检查远端完整 CI，通过后整合到 main，再创建并推送 v0.5.3 新标签。跟踪 Release，核实草稿门禁与五资源，更新发布结果及继承资料。下一编号 T010／R013。
