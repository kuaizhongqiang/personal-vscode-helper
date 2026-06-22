# 记事本服务

独立轻量服务，与股票服务分离。提供 CLI 和 REST 两种管理方式。

## 数据存储

- 本地 JSON 文件，无需数据库
- 文件路径：`~/.note/data.json`（可配置）

## 数据结构

```json
{
  "notes": [
    {
      "id": "uuid",
      "title": "笔记标题",
      "content": "笔记内容",
      "created_at": "2026-06-22T10:00:00Z",
      "updated_at": "2026-06-22T12:00:00Z"
    }
  ]
}
```

## CLI 命令

供 openclaw 通过命令行管理数据：

| 命令 | 说明 |
| --- | --- |
| `note create <title> <content>` | 创建笔记 |
| `note read <id>` | 查看笔记详情 |
| `note update <id> --title "新标题" --content "新内容"` | 更新笔记 |
| `note delete <id>` | 删除笔记 |
| `note list` | 列出所有笔记（显示标题和更新时间） |
| `note search <keyword>` | 搜索笔记标题和内容 |

## REST API

供 VSCode 插件使用：

### `GET /api/notes` — 列出所有笔记

```json
[
  {
    "id": "uuid",
    "title": "笔记标题",
    "content": "笔记内容",
    "created_at": "2026-06-22T10:00:00Z",
    "updated_at": "2026-06-22T12:00:00Z"
  }
]
```

### `GET /api/notes/:id` — 查看单条笔记

返回单条笔记对象，同上结构。

### `POST /api/notes` — 创建笔记

```json
// Request
{ "title": "标题", "content": "内容" }

// Response 201
{ "id": "uuid", "title": "标题", "content": "内容", "created_at": "...", "updated_at": "..." }
```

### `PUT /api/notes/:id` — 更新笔记

```json
// Request
{ "title": "新标题", "content": "新内容" }

// Response 200
{ "id": "uuid", "title": "新标题", "content": "新内容", "created_at": "...", "updated_at": "..." }
```

### `DELETE /api/notes/:id` — 删除笔记

`Response 204 No Content`

---

### 错误码

| 状态码 | 说明 |
| --- | --- |
| 200 | 成功 |
| 201 | 创建成功 |
| 204 | 删除成功 |
| 404 | 笔记不存在 |
| 500 | 服务器错误 |

## VSCode 插件配置

```json
{
  "personal-vscode-helper.helperServerUrl": "http://localhost:3000",
  "personal-vscode-helper.helperApiToken": ""
}
```
> 标准扁平键，通过 `getConfiguration('personal-vscode-helper').get('helperServerUrl')` 读取。与 Todo 共享同一 helper-server，端口 `3000`，路径 `/api/notes`。

## 与 openclaw 的关系

- openclaw 通过 **CLI 命令** 管理笔记
- VSCode 插件通过 **REST API** 读写笔记
- 两者互不冲突，共享同一 JSON 数据文件
