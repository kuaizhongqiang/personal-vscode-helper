# Personal Helper Server

轻量记事本 + Todo 后端服务，供 VSCode 插件和 openclaw Agent 使用。

数据存储在本地 JSON 文件（`~/.helper/data.json`），无需数据库。

---

## 安装

```bash
# 全局安装
npm install -g personal-helper-server

# 本地开发
git clone <repo>
cd services/personal-helper-server
npm install
```

## 启动服务

```bash
# 全局安装后
phelper server start

# 指定端口
phelper server start -p 3000

# 本地开发
npm start            # 默认 :3000
npm run dev          # 热重载模式
```

服务启动后访问 `http://localhost:3000/api/health` 验证。

## CLI 命令完整清单

### 服务管理

```bash
phelper server start [-p <port>]    # 启动 REST 服务
phelper server health               # 健康检查
```

### 笔记管理

```bash
phelper note create <title> <content>     # 创建笔记
phelper note list                         # 列出所有笔记
phelper note read <id>                    # 查看笔记详情
phelper note update <id> --title "新标题" --content "新内容"  # 更新笔记
phelper note delete <id>                  # 删除笔记
phelper note search <keyword>             # 搜索笔记
```

**示例：**
```bash
phelper note create "会议记录" "讨论了 Q3 路线图"
phelper note list
# [abc12345] 会议记录  2026/6/22 10:00:00
phelper note read abc12345
```

### 待办管理

```bash
phelper todo create <group> <content>     # 创建待办
phelper todo list [--group 工作]          # 列出待办（可按分组筛选）
phelper todo check <id>                   # 标记完成
phelper todo uncheck <id>                 # 标记未完成
phelper todo delete <id>                  # 删除待办
phelper todo list-groups                  # 列出所有分组
```

**示例：**
```bash
phelper todo create 工作 "完成 M8 部署"
phelper todo list --group 工作
# ☐ [工作] 完成 M8 部署  abc12345
phelper todo check abc12345
```

## 数据结构

### 笔记 (Note)

```json
{
  "id": "mqon8botrvizua",
  "title": "会议记录",
  "content": "讨论了 Q3 路线图",
  "created_at": "2026-06-22T10:00:00Z",
  "updated_at": "2026-06-22T12:00:00Z"
}
```

### 待办 (TodoItem)

```json
{
  "id": "mqon8bpwemasx0",
  "content": "完成 M8 部署",
  "group": "工作",
  "done": false,
  "created_at": "2026-06-22T10:00:00Z",
  "done_at": null
}
```

## 配置说明

参见 `.env.example`：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `HELPER_DATA_DIR` | `~/.helper` | JSON 数据文件目录 |
| `API_TOKEN` | 空 | REST API 鉴权 Token（空则不启用） |

## REST API 端点

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| GET | `/api/health` | 健康检查 | 否 |
| GET | `/api/notes` | 列出笔记 | 可选 |
| POST | `/api/notes` | 创建笔记 | 可选 |
| GET | `/api/notes/:id` | 查看笔记 | 可选 |
| PUT | `/api/notes/:id` | 更新笔记 | 可选 |
| DELETE | `/api/notes/:id` | 删除笔记 | 可选 |
| GET | `/api/todos` | 列出待办 | 可选 |
| POST | `/api/todos` | 创建待办 | 可选 |
| PATCH | `/api/todos/:id` | 更新待办 | 可选 |
| DELETE | `/api/todos/:id` | 删除待办 | 可选 |

> 认证：如果设置了 `API_TOKEN`，需要在 Header 中携带 `Authorization: Bearer <token>`。

## 错误处理

| 状态码 | 含义 | 处理建议 |
|--------|------|----------|
| `200` | 成功 | — |
| `201` | 创建成功 | — |
| `204` | 删除成功 | — |
| `400` | 参数错误 | 检查请求 body 是否包含必填字段 |
| `401` | 认证失败 | 检查 API_TOKEN 是否正确 |
| `404` | 资源不存在 | 检查 ID 是否正确 |
| `500` | 服务端错误 | 检查服务日志 |

## VSCode 插件集成

在 VSCode 设置中配置：

```json
{
  "personal-vscode-helper.helperServerUrl": "http://localhost:3000",
  "personal-vscode-helper.helperApiToken": ""
}
```

插件激活后会自动连接此服务进行数据同步。
