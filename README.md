# Personal VSCode Helper

个人 VSCode 工作台插件，集成记事本、Todo 列表、股票行情、配置管理等面板工具。

## 功能模块

| 模块 | 状态 | 说明 |
|------|:----:|------|
| SVN 集成 | ✅ 完成 | 侧边栏查看状态、提交、更新 |
| Plastic SCM 集成 | ✅ 完成 | 侧边栏查看状态、提交、更新 |
| 配置页 | ⏳ M1 | 助手服务 + 股票服务地址/Token |
| 记事本 | ⏳ M2 | Panel 编辑、本地持久化 |
| Todo 列表 | ⏳ M3 | 分组管理、状态切换 |
| 股票列表 | ⏳ M4 | TreeView 低调展示行情 |
| CLI 命令 | ⏳ M5 | Agent 可调用命令 |
| 服务端同步 | ⏳ M6 | 对接 helper-server REST API |
| 候选功能 | ⏳ M7 | 仪表盘/计时/状态栏/右键菜单/命令收藏/TODO高亮 |

## 快速开始

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 打包 + 本地安装
npm run install-local

# F5 调试运行
# 在新窗口中 Ctrl+Shift+P → Hello World
```

## 开发计划

详细文档见 [docs/](docs/)：

| 文档 | 内容 |
|------|------|
| [roadmap.md](docs/roadmap.md) | 需求清单总表 |
| [dev-plan/overview.md](docs/dev-plan/overview.md) | 整体架构、技术选型、开发顺序 |
| [dev-plan/config.md](docs/dev-plan/config.md) | 配置页设计 |
| [dev-plan/integration.md](docs/dev-plan/integration.md) | HTTP Client + 健康检查 |
| [dev-plan/notepad.md](docs/dev-plan/notepad.md) | 记事本模块 |
| [dev-plan/todo.md](docs/dev-plan/todo.md) | Todo 模块 |
| [dev-plan/stock.md](docs/dev-plan/stock.md) | 股票模块 |
| [dev-plan/cli.md](docs/dev-plan/cli.md) | CLI 命令清单 |
| [dev-plan/candidates.md](docs/dev-plan/candidates.md) | 候选功能设计 |
| [dev-plan/release.md](docs/dev-plan/release.md) | 发布与 CI/CD |
| [server/](docs/server/) | 服务端 API 文档 |

## 配置

```json
{
  "personal-vscode-helper.helperServerUrl": "http://localhost:3000",
  "personal-vscode-helper.helperApiToken": "",
  "personal-vscode-helper.stockServerUrl": "https://your-server.com",
  "personal-vscode-helper.stockApiToken": "",
  "personal-vscode-helper.stockRefreshInterval": 300
}
```

## 技术栈

- TypeScript + VSCode Extension API
- WebView Panel（记事本、Todo、配置）
- TreeView（股票、候选功能）
- globalState 本地持久化
- REST API 与后端通讯
