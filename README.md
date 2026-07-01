# Personal VSCode Helper

个人 VSCode 工作台插件，集成记事本、Todo 列表、股票行情、配置管理、SVN/PlasticSCM 等面板工具。配套轻量后端服务 `personal-helper-server`，支持 CLI + REST 双模式管理数据。

## 功能模块

| 模块 | 状态 | 说明 |
|------|:----:|------|
| SVN 集成 | ✅ 完成 | 侧边栏查看状态、提交、更新 |
| Plastic SCM 集成 | ✅ 完成 | 侧边栏查看状态、提交、更新 |
| 配置页 | ✅ 完成 | WebView 配置助手服务 + 股票服务地址/Token + 测试连接 |
| 记事本 | ✅ 完成 | WebView Panel 编辑、本地持久化、搜索、自动保存 |
| Todo 列表 | ✅ 完成 | 分组管理、内联编辑、勾选切换、清空已完成 |
| 股票列表 | ✅ 完成 | TreeView 低调展示行情（无红绿）、双频轮询、点击展开详情 |
| CLI 命令 | ✅ 完成 | Agent/用户双路径调用，13 个命令覆盖笔记和 Todo |
| 服务端同步 | ✅ 完成 | 启动时自动合并、离线降级、60s 自动重试、手动触发同步 |
| 项目仪表盘 | ✅ 完成 | 状态栏 Git 分支 + 变更数 + hover 最近提交 |
| 工作计时 | ✅ 完成 | 光标节流计时、5min 空闲暂停、每日项目统计 |
| 右键菜单 | ✅ 完成 | 复制正斜杠路径、复制 import 语句、外部工具打开 |
| 命令收藏 | ✅ 完成 | TreeView 分类展示、一键执行终端命令 |
| TODO 高亮 | ✅ 完成 | 编辑器内 TODO/FIXME/HACK/NOTE 四色高亮 + 侧边栏汇总 |

## 快速开始

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 打包 + 本地安装
npm run install-local

# F5 调试运行
# Ctrl+Shift+P → 打开配置面板 / 打开记事本 / 打开 Todo 列表
```

### 启动后端服务

```bash
# 1. 先启动 Fi-Pool-Manager REST API（股票数据源）
cd /path/to/Fi-Pool-Manager
npx fi-pool serve        # 默认端口 3721

# 2. 再启动 helper-server（记事本 + Todo + 股票代理）
cd services/personal-helper-server
npm install

# 复制环境变量模板
cp .env.example .env
# 编辑 .env 配置 API_TOKEN 和 FI_POOL_MANAGER_URL

npm start                # http://localhost:3005
```

## CLI 命令（供 Agent 调用）

支持双路径设计：**Agent 传参静默执行** / **用户无参弹窗引导**。

```typescript
// Agent 静默调用
const note = await vscode.commands.executeCommand(
  'personal-vscode-helper.note.create',
  { title: '会议记录', content: '讨论了 Q3 路线图' }
);
```

完整命令列表见 [docs/dev-plan/cli.md](docs/dev-plan/cli.md)。

## 项目结构

```
src/                          # VSCode 插件源码
├── extension.ts              # 激活入口
├── commands.ts               # 集中命令注册
├── server/                   # HTTP Client + 服务端同步
│   ├── client.ts             # ApiClient 封装
│   ├── endpoints.ts          # Client 实例管理
│   ├── errors.ts             # 错误类型
│   └── sync.ts               # 双端合并同步
├── store/
│   ├── noteStore.ts          # 笔记本地存储
│   └── todoStore.ts          # Todo 本地存储
├── panels/
│   ├── configPanel.ts        # 配置面板 WebView
│   ├── notepadPanel.ts       # 记事本 Panel
│   └── todoPanel.ts          # Todo Panel
├── views/
│   ├── stockTree.ts          # 股票 TreeView
│   ├── stockPoller.ts        # 股票轮询
│   ├── stockDetailPanel.ts   # 股票详情 WebView
│   ├── contextMenu.ts        # 右键菜单
│   ├── statusBarItems.ts     # 仪表盘 + 工作计时
│   ├── commandCollection.ts  # 命令收藏 TreeView
│   └── todoHighlighter.ts    # TODO 高亮
└── cli/
    ├── noteCli.ts            # 笔记 CLI 命令
    ├── todoCli.ts            # Todo CLI 命令
    ├── plasticCli.ts
    └── svnCli.ts

services/
└── personal-helper-server/   # 后端服务（CLI + REST）
    ├── src/
    │   ├── index.ts          # Express 入口
    │   ├── cli.ts            # Commander CLI（phelper）
    │   ├── store.ts          # JSON 文件存储
    │   └── routes/
    │       ├── notes.ts      # 笔记 CRUD
    │       ├── todos.ts      # Todo CRUD
    │       └── health.ts     # 健康检查
    └── README.md             # Agent 使用文档
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
| [server/SKILL.md](docs/server/SKILL.md) | 服务端 Agent 文档 |
| [service README](services/personal-helper-server/README.md) | 后端服务使用说明 |

## 配置

```json
{
  "personal-vscode-helper.helperServerUrl": "http://localhost:3000",
  "personal-vscode-helper.helperApiToken": "",
  "personal-vscode-helper.stockServerUrl": "https://your-server.com",
  "personal-vscode-helper.stockApiToken": "",
  "personal-vscode-helper.stockRefreshInterval": 300,
  "personal-vscode-helper.externalToolCommand": "explorer"
}
```

## 技术栈

- TypeScript + VSCode Extension API
- WebView Panel（记事本、Todo、配置、股票详情）
- TreeView（股票、命令收藏、TODO 标记）
- globalState 本地持久化
- REST API 与后端通讯（含离线降级 + 自动合并同步）
- Commander CLI（后端 `phelper` 命令）
- Express（后端 REST 服务）
- JSON 文件存储（无需数据库）
