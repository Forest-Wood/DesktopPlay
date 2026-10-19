# DesktopPet 当前项目状态

更新日期：2026-10-19（Asia/Shanghai）。约定见 [AGENTS.md](../AGENTS.md)，验收见 [需求登记](REQUIREMENTS.md)。

## 当前工作

- 目录 `D:\desktop1\DesktopPlay`；当前分支 `feat/T005-reset-cards`。
- 已获取远程状态：main `979764a`（v0.5.1、PR #2）。原 `release/T003-v051` 与本地发布记录 `c84113d` 保留；T004 从该提交建立。结果提交见各任务 Git 历史。
- 开始时 `.gitignore` 有行尾／空行修改，已保留，快照在忽略的 `.tmp/T004-existing-gitignore.patch`。
- 本轮为本地实现与提交，版本保持 0.5.1；推送、PR、合并和发布另行授权。

| 任务 | 状态 | 下一步 |
| --- | --- | --- |
| [T004：Git 准备](tasks/T004-git-preparation.md) | 待审查 | 本地提交 `e9ffff8` |
| [T005：重置卡](tasks/T005-reset-cards.md) | 待审查 | 摘要下移 12 DIP；build、几何 19 项、Electron 3 项通过，待整合至 T006 |
| T006：角色化完成提醒 | 进行中 | 现有独立分支已实现；继续处理桌面端漏提醒反馈 |

任务分支依次基于前一任务，最终按 T004 → T005 → T006 审查整合。下一未分配编号 T007／R010。T001／T002 已合并，T003 发布完成、本地记录待审查。

## 已发布版本与定位

[v0.5.1 Release](https://github.com/Forest-Wood/DesktopPlay/releases/tag/v0.5.1) 的标签、CI、工作流及附件在 2026-10-15 已核实，证据和限制见 [T003](tasks/T003-release-v051.md)。本轮不移动标签。

气泡默认 3 秒、时间可配置；GPT 倒计时单行，设置页白色。产品名 DesktopPet，兼容 appId 与 `%APPDATA%\DesktopPlay` 保持。命令和隔离方式见 AGENTS.md；本机 GPU／AppContainer 限制见 T001。

## 本轮验证

- 通过：远程状态／祖先关系、TODO 忽略／无跟踪项、文档与差异检查（T004）。
- 失败后恢复：受限网络 fetch 无法连接，沙箱外读取成功。
- 通过：T005 类型检查、相关单测 32 项、build、隔离 Electron 重置卡测试 1 项及截图检查。
- 失败后修复：T005 时区断言／测试 env 类型；复验成功。受限 Electron ACL 失败，沙箱外软件渲染隔离测试成功。
- 未运行：T006 新功能、全量回归、真实账户／客户端、打包与安装；T006 尚未实现。
