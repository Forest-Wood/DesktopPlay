# T004：Git 准备与本地 TODO

- 日期：2026-10-20（Asia/Shanghai）；负责人：Codex；需求：R007。
- 状态：已合并（整合 [PR #3](https://github.com/Forest-Wood/DesktopPlay/pull/3)，合并提交 `e3a1f3d`）；结果提交：`e9ffff8`。
- 工作目录：`D:\desktop1\DesktopPlay`；分支：`chore/T004-git-preparation`；目标：`main`。
- 基准：`c84113d`，其父提交为远程 main `979764a`；依赖顺序 T004 → T005 → T006。
- 范围：TODO 忽略规则与管理文档，无业务修改。

## 已有工作与决定

实施前 `git fetch --prune origin` 成功，main 仍为 `979764a596e3c4f639d09db53ce8f0f879104981`。首次受限网络失败，沙箱外读取成功。原 `release/T003-v051` 及发布记录提交 `c84113d` 保留；T004 从该提交建立，未改写历史。

开始时 `.gitignore` 有行尾／空行修改，快照保存在忽略的 `.tmp/T004-existing-gitignore.patch`；在其上追加规则，不将已有修改归为新功能。没有创建 TODO 文件，当前及历史路径没有已跟踪 TODO。根目录 TODO／TODO.md（含大小写变体）仅保留本地。

## 验证

- 通过：远程状态／祖先关系；原分支保留；`git check-ignore --no-index` 覆盖 TODO、TODO.md、todo.md、ToDo.MD；`git ls-files` 无跟踪项；`git diff --check`。
- 未运行：业务测试／构建／Electron smoke；本任务无业务修改，后续功能任务执行。

T005、T006 已按顺序建立并保留独立提交。2026-10-20 三条任务分支推送后，PR #3 已合并；未改写历史，TODO 不上传。后续版本发布由 T007 单独记录，本任务无新增业务变更。
