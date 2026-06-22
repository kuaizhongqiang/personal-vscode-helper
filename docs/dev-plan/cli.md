# CLI 命令清单开发计划

## Goal

将记事本和 Todo 模块的核心操作暴露为 VSCode 命令，让 Agent（或用户）无需操作 UI 即可通过命令面板管理内容。每个命令支持双重调用路径：**Agent 传参调用（静默执行）**和**用户交互调用（弹窗引导）**。

---

## 命名空间

所有命令统一前缀 `personal-vscode-helper`，与面板命令一致：

- 面板命令：`personal-vscode-helper.openNotepad` / `personal-vscode-helper.openTodo` / `personal-vscode-helper.openConfig`
- CLI 命令：`personal-vscode-helper.note.create` / `personal-vscode-helper.todo.list` 等

---

## 命令列表

### 记事本

| 命令 ID | 标题 | 说明 | Agent 参数 |
|---------|------|------|------------|
| `personal-vscode-helper.note.list` | 列出所有笔记 | 输出到 OutputChannel | — |
| `personal-vscode-helper.note.create` | 创建笔记 | Agent 传参直接创建，用户弹输入框 | title, content |
| `personal-vscode-helper.note.get` | 查看笔记 | 在新文档打开内容 | id |
| `personal-vscode-helper.note.update` | 更新笔记 | 更新标题和/或内容 | id, title?, content? |
| `personal-vscode-helper.note.delete` | 删除笔记 | Agent 传 ID 直接删，用户弹框确认 | id |
| `personal-vscode-helper.note.search` | 搜索笔记 | 输出匹配结果 | keyword |

### Todo

| 命令 ID | 标题 | 说明 | Agent 参数 |
|---------|------|------|------------|
| `personal-vscode-helper.todo.list` | 列出所有待办 | 按分组列出 | group? |
| `personal-vscode-helper.todo.create` | 创建待办 | Agent 传参直接创建 | content, group |
| `personal-vscode-helper.todo.check` | 标记完成 | 传 ID 直接标记 | id |
| `personal-vscode-helper.todo.uncheck` | 标记未完成 | 传 ID 直接取消标记 | id |
| `personal-vscode-helper.todo.delete` | 删除待办 | 传 ID 直接删，用户弹框确认 | id |
| `personal-vscode-helper.todo.listGroups` | 列出所有分组 | — | — |
| `personal-vscode-helper.todo.clearCompleted` | 清空已完成 | 静默执行，返回删除条数 | — |

---

## 双路径调用设计

核心原则：**有参 = Agent 静默执行，无参 = 用户交互引导**。

```typescript
// 注册时函数签名接收可选参数
vscode.commands.registerCommand(
    'personal-vscode-helper.note.create',
    async (args?: { title?: string; content?: string }) => {
        let title = args?.title;
        let content = args?.content;

        // 🔵 Agent 路径：有参，直接执行
        if (title !== undefined && content !== undefined) {
            const note = noteStore.create(title, content);
            vscode.window.showInformationMessage(`笔记已创建: ${note.id.slice(0, 8)}`);
            return note;
        }

        // 🟢 用户路径：无参，弹窗引导
        title = await vscode.window.showInputBox({
            prompt: '笔记标题',
            placeHolder: '输入标题'
        });
        if (!title) return;

        content = await vscode.window.showInputBox({
            prompt: '笔记内容',
            placeHolder: '输入内容'
        });
        if (!content) return;

        const note = noteStore.create(title, content);
        vscode.window.showInformationMessage(`笔记已创建: ${note.id.slice(0, 8)}`);
        return note;
    }
);
```

### 选择型命令的 Agent 路径

```typescript
// todo.check — Agent 传 ID，用户 QuickPick
vscode.commands.registerCommand(
    'personal-vscode-helper.todo.check',
    async (args?: { id?: string }) => {
        // Agent 路径：直接传 ID
        if (args?.id) {
            todoStore.check(args.id);
            vscode.window.showInformationMessage('已标记完成');
            return;
        }

        // 用户路径：QuickPick 选择
        const todos = todoStore.list().filter(t => !t.done);
        if (todos.length === 0) {
            vscode.window.showInformationMessage('没有未完成的待办');
            return;
        }
        const picked = await vscode.window.showQuickPick(
            todos.map(t => ({ label: `[${t.group}] ${t.content}`, id: t.id })),
            { placeHolder: '选择要标记完成的待办' }
        );
        if (!picked) return;
        todoStore.check(picked.id);
        vscode.window.showInformationMessage('已标记完成');
    }
);
```

### 返回值的 Agent 使用

```typescript
// Agent 可获取命令返回值
const note = await vscode.commands.executeCommand(
    'personal-vscode-helper.note.create',
    { title: '会议记录', content: '讨论了 V2 架构方案...' }
);
// note = { id: 'abc12345', title: '...', ... }

const count = await vscode.commands.executeCommand(
    'personal-vscode-helper.todo.clearCompleted'
);
// count = 3
```

---

## 输出列表命令

```typescript
// 统一用 OutputChannel，易于 Agent 解析
const outputChannel = vscode.window.createOutputChannel('个人工作台');

vscode.commands.registerCommand(
    'personal-vscode-helper.note.list',
    async () => {
        const notes = noteStore.list();
        if (notes.length === 0) {
            outputChannel.appendLine('(暂无笔记)');
        } else {
            for (const n of notes) {
                outputChannel.appendLine(`[${n.id.slice(0, 8)}] ${n.title}  ${new Date(n.updatedAt).toLocaleString()}`);
            }
        }
        outputChannel.show();
        return notes; // Agent 可直接拿返回值
    }
);
```

---

## 命令注册管理

```typescript
// src/commands.ts
export function registerCommands(context: vscode.ExtensionContext) {
    registerNoteCommands(context);
    registerTodoCommands(context);
    registerPanelCommands(context);  // openConfig / openNotepad / openTodo
    registerStockCommands(context);
}
```

---

## 实现步骤

1. 统一命名空间 `personal-vscode-helper.*`
2. 每个命令实现双路径：`args?.xxx !== undefined` → Agent 路径，`else` → 用户交互路径
3. 有返回值的命令通过 `return` 传递结果
4. 列表类统一用 `OutputChannel`
5. Agent 调用示例写入 README

---

## 验收标准

- [ ] 所有命令统一 `personal-vscode-helper.*` 前缀
- [ ] 用户从命令面板执行 → 弹窗交互引导
- [ ] Agent 调用 `executeCommand('cmd', { id: '...' })` → 静默执行，不弹窗
- [ ] Agent 调用 `executeCommand('cmd', { title, content })` → 直接创建
- [ ] 命令返回值包含操作结果
- [ ] 命令间无命名冲突
