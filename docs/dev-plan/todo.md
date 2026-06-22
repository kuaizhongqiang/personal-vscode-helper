# Todo 列表模块开发计划

## Goal

在 VSCode 侧边栏或底部区域提供一个 Todo Panel，支持添加/勾选/删除待办事项，按分组管理，本地持久化，同时暴露 CLI 命令供 Agent 管理。后续对接后端 todo-service。

---

## 数据模型

```typescript
interface TodoItem {
    id: string;          // uuid
    content: string;     // 待办内容
    group: string;       // 分组（工作 / 个人 / 其他）
    done: boolean;       // 是否完成
    createdAt: number;   // 创建时间戳
    doneAt: number | null; // 完成时间戳
}
```

---

## Panel UI 设计

```
┌─────────────────────────────┐
│  ✅ Todo 列表         [+ 添加]│
├─────────────────────────────┤
│  分组：[ 全部 ▼ ]            │
│                             │
│  ── 工作 ──                 │
│  ☐ 更新个人工作台 v0.0.2     │
│  ☑ 提交代码到 main 分支      │
│  ☐ 编写 CLI 命令文档         │
│                             │
│  ── 个人 ──                 │
│  ☐ 看 Chovy 比赛回放         │
│  ☑ 购买服务器续费            │
│                             │
│  ── 其他 ──                 │
│  ☐ 整理桌面文件              │
│                             │
│  ─────────────────          │
│  [✕ 清空已完成]  共 5 项     │
└─────────────────────────────┘
```

### 交互要点

- 点击复选框 `☐` → 标记完成 → 自动移到分组底部或变灰
- 点击文本框 → 编辑内容（内联编辑）
- 右侧删除图标 → 删除该项
- 分组下拉切换显示：全部 / 工作 / 个人 / 其他
- 新建分组：在添加按钮的下拉中选择或输入新分组名
- 清空已完成：批量删除 done=true 的项

---

## 本地存储

```typescript
// store/todoStore.ts

const TODOS_KEY = 'personal-helper.todos';

class TodoStore {
    constructor(private context: vscode.ExtensionContext);

    list(group?: string): TodoItem[];
    create(content: string, group: string): TodoItem;
    check(id: string): TodoItem;              // 标记完成
    uncheck(id: string): TodoItem;            // 标记未完成
    updateContent(id: string, content: string): TodoItem;
    delete(id: string): void;
    clearCompleted(): void;                 // 清空已完成
    listGroups(): string[];
    createGroup(name: string): void;

    private save(todos: TodoItem[]): void;
    private load(): TodoItem[];
}
```

---

## WebView ↔ Extension 通信

### Extension → WebView

```typescript
// Todo 列表 + 分组
webview.postMessage({
    type: 'todosData',
    data: { todos: TodoItem[], groups: string[], activeGroup: '全部' }
});
```

### WebView → Extension

```typescript
// 添加
vscode.postMessage({ type: 'addTodo', content: '...', group: '工作' });

// 切换完成
vscode.postMessage({ type: 'checkTodo', id: '...', done: true });

// 编辑内容
vscode.postMessage({ type: 'updateTodo', id: '...', content: '...' });

// 删除
vscode.postMessage({ type: 'deleteTodo', id: '...' });

// 清空已完成
vscode.postMessage({ type: 'clearCompleted' });

// 切换分组
vscode.postMessage({ type: 'switchGroup', group: '工作' });
```

---

## 服务端同步（Phase 2）

```typescript
// 激活时拉取
const serverTodos = await todoClient.get<TodoItem[]>('/api/todos');
// 合并策略：按 done_at 较新者为准

// 创建
await todoClient.post('/api/todos', { content, group });

// 切换完成
await todoClient.patch(`/api/todos/${id}`, { done: true });

// 删除
await todoClient.delete(`/api/todos/${id}`);
```

---

## CLI 命令

| 命令 ID | 说明 | 参数 |
|---------|------|------|
| `helper.todo.list` | 列出待办 | group? |
| `helper.todo.create` | 创建待办 | content, group |
| `helper.todo.check` | 标记完成 | id |
| `helper.todo.uncheck` | 标记未完成 | id |
| `helper.todo.delete` | 删除待办 | id |
| `helper.todo.listGroups` | 列出分组 | — |
| `helper.todo.clearCompleted` | 清空已完成 | — |

---

## 入口

- 命令面板：`personal-vscode-helper.openTodo`
- 侧边栏图标
- 快捷键：待定

---

## 实现步骤

1. 创建 `store/todoStore.ts`，实现分组、增删改查、持久化
2. 创建 `panels/todoPanel.ts`，管理 WebView Panel
3. 编写面板 HTML：分组下拉 + 列表 + 内联编辑
4. 实现消息通道
5. 注册命令和入口
6. CLI 命令接入 todoStore
7. 对接 todo-service 同步（后续）

---

## 验收标准

- [ ] 打开 Todo 面板，按分组显示待办
- [ ] 添加待办：输入内容 + 选择分组 → 列表刷新
- [ ] 点击复选框切换完成状态，已完成项灰显
- [ ] 分组下拉切换筛选
- [ ] 内联编辑内容
- [ ] 清空已完成
- [ ] 关闭 VSCode 再打开，待办不丢失
- [ ] CLI 命令可独立操作
