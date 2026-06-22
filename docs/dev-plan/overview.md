# 整体架构与开发计划概述

## Goal

构建一个 VSCode 个人工作台插件，在编辑器内提供记事本、Todo、股票列表、配置管理等面板，通过 REST API 与后端服务通讯，同时暴露 CLI 命令供 Agent 调用。

---

## 服务端依赖

| 服务 | npm 包名 | CLI 命令 | 说明 | 接口文档 |
|------|---------|----------|------|----------|
| personal-helper-server | `personal-helper-server` | `phelper` | 记事本 + Todo，` :3000` | [../server/note-api.md](../server/note-api.md) [../server/todo-api.md](../server/todo-api.md) |
| stock-analyzer | 已部署 | 无 | 股票数据、分析 | [../server/remote-data-api.md](../server/remote-data-api.md) |

> 服务端由 openclaw 管理，插件只负责消费 REST API。

---

## 插件技术选型

| 层 | 方案 | 原因 |
|----|------|------|
| 语言 | TypeScript | VSCode 官方推荐 |
| UI 面板 | WebView (HTML + vanilla JS) | 灵活性高，无需引入 React |
| 本地存储 | `context.globalState` | VSCode 内置 KV 存储，跨会话持久化 |
| HTTP 请求 | `node:fetch` (Node 18+) | 零依赖 |
| 配置 | `vscode.workspace.getConfiguration` | VSCode 标准配置项 |
| 树视图 | `vscode.window.createTreeView` | 侧边栏列表 |

---

## src/ 目录结构

```
src/
├── extension.ts           ← activate / deactivate
├── commands.ts            ← 所有命令注册集中管理
├── panels/
│   ├── notepadPanel.ts    ← 记事本 WebView Panel
│   ├── todoPanel.ts       ← Todo WebView Panel
│   └── configPanel.ts     ← 配置页 WebView Panel
├── views/
│   ├── stockTree.ts       ← 股票列表 TreeView
│   └── candidateViews.ts  ← 候选功能 TreeView
├── server/
│   ├── client.ts          ← HTTP Client 封装
│   └── endpoints.ts       ← 各服务 URL 配置
├── store/
│   ├── noteStore.ts       ← 笔记本地存储
│   └── todoStore.ts       ← Todo 本地存储
└── cli/
    ├── noteCli.ts         ← 笔记 CLI 命令实现
    └── todoCli.ts         ← Todo CLI 命令实现
```

---

## 开发顺序

| 阶段 | 模块 | 依赖 | 说明 |
|------|------|------|------|
| 0 | server/client 骨架 | 无 | ApiClient + healthCheck，config 面板需要它来测试连接 |
| 1 | config 配置页 | 0 | 测试连接按钮立即可用 |
| 2 | notepad 记事本 | 1 | 使用 helperClient |
| 3 | todo Todo 列表 | 1 | 使用 helperClient |
| 4 | stock 股票列表 | 1 | 使用 stockClient |
| 5 | cli 命令暴露 | 2+3 | note + todo 完成后 |
| 6 | candidates 候选功能 | 按需 | |
