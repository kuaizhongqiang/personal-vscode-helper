# Personal Helper Server

轻量记事本 + Todo 后端服务。提供 CLI 和 REST 两种管理方式，数据存储在本地 JSON 文件，无需数据库。

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务（默认 :3000）
npm start

# 开发模式（热重载）
npm run dev
```

## CLI 命令

所有 CLI 命令通过 `phelper` 入口执行：

```bash
# 直接运行
npx tsx src/cli.ts <command>

# 或安装后
npm run cli -- <command>
```

### 笔记管理

| 命令 | 说明 |
|------|------|
| `note create <title> <content>` | 创建笔记 |
| `note list` | 列出所有笔记 |
| `note read <id>` | 查看笔记详情 |
| `note update <id> [--title] [--content]` | 更新笔记 |
| `note delete <id>` | 删除笔记 |
| `note search <keyword>` | 搜索笔记 |

### 待办管理

| 命令 | 说明 |
|------|------|
| `todo create <group> <content>` | 创建待办 |
| `todo list [--group]` | 列出待办 |
| `todo check <id>` | 标记完成 |
| `todo uncheck <id>` | 标记未完成 |
| `todo delete <id>` | 删除待办 |
| `todo list-groups` | 列出分组 |

## REST API

### 健康检查

```bash
curl http://localhost:3000/api/health
```

### 笔记

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notes` | 列出所有笔记 |
| GET | `/api/notes/:id` | 查看单条笔记 |
| POST | `/api/notes` | 创建笔记 |
| PUT | `/api/notes/:id` | 更新笔记 |
| DELETE | `/api/notes/:id` | 删除笔记 |

### 待办

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/todos` | 列出待办（支持 `?group=&done=`） |
| GET | `/api/todos/groups` | 列出所有分组 |
| POST | `/api/todos` | 创建待办 |
| PATCH | `/api/todos/:id` | 更新待办（完成状态/内容/分组） |
| DELETE | `/api/todos/:id` | 删除待办 |

## 环境变量

参见 [`.env.example`](.env.example)。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `HELPER_DATA_DIR` | `~/.helper` | 数据存储目录 |
| `API_TOKEN` | 空 | REST API 认证 Token（空则不启用） |

## API 认证

如果设置了 `API_TOKEN`，所有请求需要携带：

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/notes
```

## 数据存储

- 文件路径：`~/.helper/data.json`（可配置 `HELPER_DATA_DIR`）
- 本地 JSON 文件，无需数据库
- 删除文件即可重置所有数据

## VSCode 插件集成

VSCode 插件通过 REST API 连接此服务，在插件配置中设置：

```json
{
  "personal-vscode-helper.helperServerUrl": "http://localhost:3000",
  "personal-vscode-helper.helperApiToken": ""
}
```
