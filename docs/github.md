# GitHub PR 创建流程

本仓库在 2026-10-23 多次遇到 GitHub 连接器创建 PR 返回 403，但已有 Git 凭据调用官方 API 成功。用户进一步选择使用 `gh`，后续优先使用已登录的 GitHub CLI；Node.js 命令保留为备用。连接器授权／连接状态没有变化时，读取继续使用连接器，创建 PR 不再重复尝试已知失败的连接器写入。

## 首选：GitHub CLI

2026-10-23 已通过官方 WinGet 源安装 GitHub CLI 2.103.0，并验证 `gh --version`。安装路径为 `C:\Program Files\GitHub CLI\gh.exe`；本次交付前已通过 `gh auth status` 核实 Forest-Wood 账号登录成功。其他设备或登录失效时，关闭旧终端并打开一个新 PowerShell 窗口，让新的 PATH 生效，然后运行：

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth status
```

浏览器账户授权需要用户亲自完成。日后以实际 `gh auth status` 结果判断登录状态；不要通过 `gh auth status --json` 的退出码判断，它在未登录时也可能返回 0。不输出访问令牌。

登录后可先只读试用：

```powershell
gh pr list --repo Forest-Wood/DesktopPlay
gh run list --repo Forest-Wood/DesktopPlay --limit 5
```

创建 PR 前先按 head 查询开放 PR，检查基线、链接及 head SHA；已有同基线 PR 直接复用，基线不一致先处理原 PR。完成已授权的提交／推送后，再显式指定仓库、head、base、title 和 `--body-file` 创建，避免交互推送或意外创建 fork。正文按项目模板保存成 `.tmp/PR.md`，不把多段正文拼进 shell 字符串。创建后仍需附加 PR 到当前任务并核实远程。

## 备用：已有 Git 凭据命令

先完成本次授权范围内的差异检查、提交和分支推送。把 PR 模板内容写入 `.tmp/PR.json`，只包含以下字段；正文使用 JSON 字符串的换行转义，脚本会解析为实际换行：

```json
{
  "title": "docs(T018): 优化 GitHub PR 创建流程",
  "head": "chore/T018-github-pr",
  "base": "main",
  "body": "按 PR 模板填写问题、变更、验证和限制。\n\n保留实际段落。",
  "draft": false
}
```

先只校验文件，不读取凭据或访问网络：

```powershell
npm.cmd run pr:create -- .tmp/PR.json --check
```

用户已授权创建 PR 时，再运行：

```powershell
npm.cmd run pr:create -- .tmp/PR.json
```

仓库固定为 Forest-Wood/DesktopPlay，支持本仓库 head／base 分支。创建前按 head 查询：已有同基线 PR 时返回其链接；已有 PR 指向其他基线或结果不唯一时停止，避免重复创建或擅自改基线。POST 超时不自动重试；重新执行仍会先查询已存在的 PR。

创建或找到 PR 后，代理仍需调用当前任务的 PR 附加工具，并核对远程 head SHA、基线、文件范围及工作区状态。这个命令不执行提交、推送、合并、发布或更改连接器授权。Git 凭据只在内存中使用；凭据不可用时返回简短错误，不触发交互登录，不输出原始响应或令牌。

实现见 [github-pr.mjs](../scripts/github-pr.mjs)，隔离测试见 [github-pr.test.ts](../tests/unit/github-pr.test.ts)。测试使用伪凭据和模拟 HTTP，不创建真实 PR。

依据：[GitHub CLI Windows 安装](https://github.com/cli/cli/blob/trunk/docs/install_windows.md)、[gh auth login](https://cli.github.com/manual/gh_auth_login)、[GitHub Pull Requests REST API](https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28)、[git credential](https://git-scm.com/docs/git-credential)。
