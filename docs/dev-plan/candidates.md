# 候选需求设计要点

## Goal

为 P2-P3 优先级的候选功能预留设计方向，待到开发时可直接参考。每个候选需求仅记录核心交互和数据流，不做完整 UI 细化。

---

## 6. 项目仪表盘

### 目标

当前工作区 Git 状态一目了然：分支名、变更文件数、最近 3 条 commit。

### 数据来源

```typescript
// 调用 git 命令（通过 vscode.git 扩展 API）
// API 在不同 VSCode 版本间可能变化，加 try-catch 兜底
try {
    const git = vscode.extensions.getExtension('vscode.git')?.exports;
    const api = git?.getAPI();
    const repo = api?.repositories[0];
    if (!repo) return; // 工作区非 git 仓库

    const branch = repo.state.HEAD?.name;
    const changes = repo.state.workingTreeChanges.length;
    const commits = await repo.log({ maxEntries: 3 });
} catch (e) {
    // API 不可用 → 降级为隐藏仪表盘功能
    console.warn('Git API 不可用:', e);
}
```

### UI 形式

**StatusBarItem + Tooltip**：状态栏显示 `🔀 main Δ3`，hover 展开详情。

### 设计要点

- 当前分支名 + 变更文件数
- Hover 显示最近 3 条 commit 摘要
- 如果工作区无 Git 则隐藏

---

## 7. 工作计时统计

### 目标

记录每天在各项目中的编码时长，本地存储，不联网。

### 数据模型

```json
{
  "records": [
    {
      "date": "2026-06-22",
      "project": "f:/Project/personal-vscode-helper",
      "duration": 5400
    }
  ]
}
```

### 计时逻辑

```typescript
// throttle：每次光标移动都触发太频繁，用 10s 节流
const THROTTLE_MS = 10_000;
let lastActivity = 0;

vscode.window.onDidChangeTextEditorSelection(() => {
    const now = Date.now();
    if (now - lastActivity < THROTTLE_MS) return;
    lastActivity = now;
    // 记录活动时间
});

vscode.window.onDidChangeActiveTextEditor(() => {
    // 切换项目，刷新计时
});

// 每 60 秒写入一次 globalState（低频，不用节流）
setInterval(() => saveToGlobalState(), 60_000);
```

### UI 形式

**StatusBarItem**：状态栏显示 `⏱ 今天 1.5h`，点击查看详细统计。

### 设计要点

- 纯本地计时，不上传
- 按日期 + 项目分组统计
- 无活动 5 分钟自动暂停
- 状态栏常驻显示当日累计

---

## 8. 状态栏信息聚合

### 目标

状态栏常驻多个信息点，一目了然，点击可展开详情。

### 信息点

| 位置 | 图标 | 内容 | 来源 |
|------|------|------|------|
| 右侧 #1 | 🔴/🟢 | 3 个服务在线/离线 | 健康检查 |
| 右侧 #2 | ✅ | Todo 待办数 | todoStore |
| 右侧 #3 | 📊 | 期货/大盘简要（可选） | stockClient |
| 右侧 #4 | ⏱ | 今日编码时长 | 工作计时模块 |
| 右侧 #5 | 🔀 | Git 分支 + 变更数 | 项目仪表盘 |

### 更新频率

- 服务状态：每 60 秒
- Todo 数量：本地 store 变更时
- 股票行情：跟随股票轮询间隔
- 计时：每 60 秒

### 设计要点

- 每个 StatusBarItem 独立、互不干扰
- Tooltip 显示详细信息
- 点击可跳转到对应面板
- 可通过配置隐藏不需要的信息点

---

## 9. 右键菜单增强

### 目标

为文件资源管理器添加常用操作的右键菜单项。

### 菜单项

| 标题 | 命令 | 说明 |
|------|------|------|
| 复制相对路径（正斜杠） | `helper.copyRelPath` | 自动转 `\` 为 `/` |
| 复制为 import 语句 | `helper.copyAsImport` | 根据当前打开文件的 import 推断格式 |
| 在外部工具打开 | `helper.openInExternal` | 可配置外部工具命令 |

### 注册

```json
// package.json contributes.menus
{
  "explorer/context": [
    {
      "command": "helper.copyRelPath",
      "when": "resourceScheme == file",
      "group": "navigation"
    },
    {
      "command": "helper.copyAsImport",
      "when": "resourceScheme == file && resourceExtname =~ /ts|tsx|js|jsx/"
    },
    {
      "command": "helper.openInExternal",
      "when": "resourceScheme == file"
    }
  ]
}
```

### 设计要点

- 右键菜单项分组放置，避免过长
- 路径转换：`f:\Project\src\a.ts` → `src/a.ts`
- import 格式根据当前文件类型自动选择（`require` / `import from`）
- 外部工具地址通过配置项指定

---

## 11. 终端命令收藏

### 目标

保存常用终端命令，面板中一键发送到终端执行。

### 数据模型

```typescript
interface SavedCommand {
    id: string;
    label: string;          // "安装依赖"
    command: string;        // "npm install"
    cwd: string;            // 执行目录（${workspaceFolder} 或固定路径）
    tag: string;            // "npm" / "git" / "docker"
}
```

### UI 形式

**TreeView** 侧边栏，按 tag 分组，点击执行。

```
📟 命令收藏
├── npm
│   ├── npm install
│   └── npm run dev
├── git
│   ├── git pull --rebase
│   └── git log --oneline -10
└── docker
    ├── docker-compose up -d
    └── docker ps
```

### 执行

```typescript
const terminal = vscode.window.createTerminal('命令收藏');
terminal.sendText(command);
terminal.show();
```

### 设计要点

- TreeView 点击直接执行
- 右上角 + 按钮添加新命令
- 本地 globalState 存储
- 支持变量替换 `${workspaceFolder}`

---

## 12. 编辑器 TODO 高亮

### 目标

编辑器内高亮 TODO / FIXME / HACK / NOTE 等标记，不同颜色区分，侧边栏汇总所有标记点。

### 高亮颜色

| 标记 | 颜色 | 装饰器样式 |
|------|------|-----------|
| TODO | 橙黄 | 背景高亮 |
| FIXME | 红色 | 背景高亮 |
| HACK | 紫色 | 背景高亮 |
| NOTE | 蓝色 | 背景高亮 |

### 实现方式：TextEditorDecorationType + 正则扫描

```typescript
const decorationTypes = {
    TODO: vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 200, 0, 0.15)',
        after: { contentText: ' // ⚠ TODO' }
    }),
    // ...
};

// 扫描当前文档
function scanDecorations(editor: vscode.TextEditor) {
    const text = editor.document.getText();
    const regex = /\b(TODO|FIXME|HACK|NOTE):?\s*(.*)$/gm;
    // 匹配并创建 DecorationOptions
    // editor.setDecorations(decorationTypes.TODO, todoRanges);
}
```

### 侧边栏汇总 TreeView

```
📌 项目标记
├── TODO (3)
│   ├── extension.ts:15 - 实现同步逻辑
│   ├── notepadPanel.ts:42 - 优化保存性能
│   └── config.ts:8 - 添加更多配置项
├── FIXME (1)
│   └── todoPanel.ts:30 - 修复分组切换 bug
└── NOTE (2)
    ├── stock.ts:55 - 行情轮询暂时用 60s
    └── client.ts:20 - 超时时间后续可配置
```

### 设计要点

- 打开文件时自动扫描
- 文件修改后重新扫描（debounce）
- 点击侧边栏条目 → 跳转到对应文件和行
- 颜色区分明显但不刺眼
