# Todo 服务

独立轻量服务，与股票服务分离。提供 CLI 和 REST 两种管理方式。

## 数据存储

- 本地 JSON 文件，无需数据库
- 文件路径：`~/.todo/data.json`（可配置）

## 数据结构

```json
{
  "todos": [
    {
      "id": "uuid",
      "content": "待办内容",
      "group": "工作",
      "done": false,
      "created_at": "2026-06-22T10:00:00Z",
      "done_at": null
    }
  ],
  "groups": ["工作", "个人", "其他"]
}
```

## CLI 命令

供 openclaw 通过命令行管理数据：

| 命令 | 说明 |
| --- | --- |
| `todo create <group> <content>` | 创建待办，group 不存在时自动创建 |
| `todo check <id>` | 标记完成 |
| `todo uncheck <id>` | 标记未完成 |
| `todo delete <id>` | 删除待办 |
| `todo list [--group 工作]` | 列出待办，可选按分组筛选 |
| `todo list-groups` | 列出所有分组 |

## REST API

供 VSCode 插件使用：

### `GET /api/todos?group=工作&done=false` — 列出待办

查询参数可选：

| 参数 | 说明 |
| --- | --- |
| `group` | 按分组筛选 |
| `done` | `true` / `false`，按完成状态筛选 |

```json
[
  {
    "id": "uuid",
    "content": "待办内容",
    "group": "工作",
    "done": false,
    "created_at": "2026-06-22T10:00:00Z",
    "done_at": null
  }
]
```

### `POST /api/todos` — 创建待办

```json
// Request
{ "content": "待办内容", "group": "工作" }

// Response 201
{ "id": "uuid", "content": "...", "group": "工作", "done": false, "created_at": "...", "done_at": null }
```

### `PATCH /api/todos/:id` — 更新待办（标记完成/未完成、修改内容或分组）

```json
// Request
{ "done": true }

// Response 200
{ "id": "uuid", "content": "...", "group": "工作", "done": true, "created_at": "...", "done_at": "2026-06-22T12:00:00Z" }
```

### `DELETE /api/todos/:id` — 删除待办

`Response 204 No Content`

### `GET /api/todos/groups` — 列出所有分组

```json
["工作", "个人", "其他"]
```

---

### 错误码

| 状态码 | 说明 |
| --- | --- |
| 200 | 成功 |
| 201 | 创建成功 |
| 204 | 删除成功 |
| 404 | 待办不存在 |
| 500 | 服务器错误 |

## VSCode 插件配置

```json
{
  "personal-vscode-helper.helperServerUrl": "http://localhost:3000",
  "personal-vscode-helper.helperApiToken": ""
}
```
> 标准扁平键，通过 `getConfiguration('personal-vscode-helper').get('helperServerUrl')` 读取。与记事本共享同一 helper-server，端口 `3000`，路径 `/api/todos`。

## 与 openclaw 的关系

- openclaw 通过 **CLI 命令** 管理待办
- VSCode 插件通过 **REST API** 读写待办
- 两者互不冲突，共享同一 JSON 数据文件
