# 记事本模块开发计划

## Goal

在 VSCode 侧边栏或底部区域提供一个记事本 Panel，支持创建/编辑/删除笔记，本地持久化存储，同时可通过 CLI 命令供 Agent 管理内容。后续对接后端 note-service 实现云端同步。

---

## 数据模型

```typescript
interface Note {
    id: string;          // uuid
    title: string;       // 笔记标题
    content: string;     // 笔记正文（纯文本 / Markdown）
    createdAt: number;   // 创建时间戳
    updatedAt: number;   // 最后修改时间戳
}
```

---

## Panel UI 设计

### 列表模式（默认）

```
┌─────────────────────────────┐
│  📒 我的笔记          [+ 新建]│
├─────────────────────────────┤
│  🔍 [搜索笔记...            ]│
│                             │
│  ┌─────────────────────────┐│
│  │ 📄 服务器配置备忘         ││
│  │    2026-06-22 10:00     ││
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ 📄 常用命令记录           ││
│  │    2026-06-21 15:30     ││
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ 📄 今日任务               ││
│  │    2026-06-22 09:00     ││
│  └─────────────────────────┘│
│                             │
└─────────────────────────────┘
```

### 编辑模式（点击笔记后）

```
┌─────────────────────────────┐
│  ← 返回列表          [🗑 删除]│
├─────────────────────────────┤
│  标题                       │
│  ┌─────────────────────────┐│
│  │ 服务器配置备忘            ││
│  └─────────────────────────┘│
│                             │
│  内容                       │
│  ┌─────────────────────────┐│
│  │                         ││
│  │                         ││
│  │                         ││
│  │                         ││
│  └─────────────────────────┘│
│                             │
│  最后修改：2026-06-22 10:00   │
└─────────────────────────────┘
```

### 新建模式

点击右上角 `[+ 新建]` 或 `Ctrl+Shift+N` 快捷键，进入编辑模式，标题和内容为空，填写后自动保存。

---

## 本地存储

```typescript
// store/noteStore.ts

const NOTES_KEY = 'personal-helper.notes';

class NoteStore {
    constructor(private context: vscode.ExtensionContext);

    list(): Note[];
    get(id: string): Note | undefined;
    create(title: string, content: string): Note;
    update(id: string, title: string, content: string): Note;
    delete(id: string): void;
    search(keyword: string): Note[];

    private save(notes: Note[]): void; // 写 globalState
    private load(): Note[];             // 读 globalState
}
```

---

## WebView ↔ Extension 通信

### Extension → WebView

```typescript
// 发送笔记列表
webview.postMessage({ type: 'notesList', data: Note[] });

// 发送单条笔记（进入编辑模式）
webview.postMessage({ type: 'openNote', data: Note });
```

### WebView → Extension

```typescript
// 新建笔记
vscode.postMessage({ type: 'createNote', title: '...', content: '...' });

// 更新笔记
vscode.postMessage({ type: 'updateNote', id: '...', title: '...', content: '...' });

// 删除笔记
vscode.postMessage({ type: 'deleteNote', id: '...' });

// 搜索笔记
vscode.postMessage({ type: 'searchNotes', keyword: '...' });
```

### 自动保存策略

- 输入停止 2 秒后自动保存（debounce）
- 返回列表时保存
- ~~编辑区失焦时保存~~（WebView blur 在 VSCode 侧边栏切换时不触发，不可靠）

---

## 服务端同步（Phase 2）

本地存储先行，后续对接 note-service：

```typescript
// 激活时
const serverNotes = await noteClient.get<Note[]>('/api/notes');
// 合并策略：服务器 newer wins（按 updatedAt）

// 本地修改后
await noteClient.post('/api/notes', newNote);
await noteClient.put(`/api/notes/${id}`, updatedNote);

// 删除
await noteClient.delete(`/api/notes/${id}`);
```

---

## CLI 命令

供 Agent 通过命令面板调用：

| 命令 ID | 说明 | 参数 |
|---------|------|------|
| `helper.note.list` | 列出所有笔记 | — |
| `helper.note.create` | 创建笔记 | title, content |
| `helper.note.get` | 查看笔记 | id |
| `helper.note.update` | 更新笔记 | id, title?, content? |
| `helper.note.delete` | 删除笔记 | id |
| `helper.note.search` | 搜索笔记 | keyword |

---

## 入口

- 命令面板：`personal-vscode-helper.openNotepad`
- 侧边栏图标
- 快捷键：`Ctrl+Shift+N`（待确认不冲突）

---

## 实现步骤

1. 创建 `store/noteStore.ts`，实现本地增删改查 + globalState 持久化
2. 创建 `panels/notepadPanel.ts`，管理 WebView Panel 生命周期
3. 编写面板 HTML：列表视图 + 编辑视图双模式切换
4. 实现消息通道：点击笔记进入编辑、新建、删除的后端逻辑
5. 注册命令和侧边栏入口
6. CLI 命令接入 noteStore，通过 `vscode.window.showInputBox` 交互
7. 对接 note-service 同步（后续）

---

## 验收标准

- [ ] 打开记事本面板，显示笔记列表
- [ ] 新建笔记：点击新建 → 输入标题和内容 → 保存 → 列表刷新
- [ ] 点击笔记进入编辑 → 修改内容 → 自动保存
- [ ] 删除笔记：确认对话框 → 删除 → 列表刷新
- [ ] 搜索笔记：输入关键字 → 筛选匹配的标题/内容
- [ ] 关闭 VSCode 再打开，笔记不丢失
- [ ] CLI 命令可独立创建/列出/删除笔记
