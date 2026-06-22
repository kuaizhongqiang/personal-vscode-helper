# 发布与 CI/CD 流水线

## Goal

建立完整的自动化流水线：代码提交 → 编译 → 打包 .vsix → 发布到 VSCode 市场 + 服务端发布到 npm。前端插件本地可一键安装，配置通过 `.env` 管理。

---

## 产物矩阵

| 产物 | 安装方式 | 发布目标 | 使用者 |
|------|----------|----------|--------|
| VSCode 插件 `.vsix` | `code --install-extension` 或市场安装 | VSCode Marketplace | 开发者（自己） |
| personal-helper-server npm 包 | `npm install -g xxx` | npm registry | openclaw 管理 |

---

## VSCode 插件发布流水线

### GitHub Actions 流程

```
push main / tag
    │
    ├── 1. npm ci
    ├── 2. npm run lint
    ├── 3. npm run compile
    ├── 4. vsce package         → 生成 .vsix
    ├── 5. Upload .vsix artifact
    └── 6. (tag push) vsce publish  → VSCode Marketplace
```

### 触发规则

| 事件 | 行为 |
|------|------|
| push 到 `main` | 编译 + 检查 + 打包 .vsix |
| push 版本 tag（`v1.0.0`） | 以上 + 发布到市场 + 创建 GitHub Release |
| PR | 仅编译 + 检查 |

### .github/workflows/ci.yml

```yaml
name: CI

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npm run compile

  package:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run compile
      - run: npx vsce package -o personal-vscode-helper.vsix
      - uses: actions/upload-artifact@v4
        with:
          name: vsix
          path: "*.vsix"

  publish:
    needs: package
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run compile
      - run: npx vsce publish -p ${{ secrets.VSCE_PAT }}
      - uses: softprops/action-gh-release@v2
        with:
          files: "*.vsix"
```

### 需要的 GitHub Secrets

| Secret | 说明 |
|--------|------|
| `VSCE_PAT` | Azure DevOps Personal Access Token（Marketplace scope） |

---

## 版本策略

### 插件版本号

遵循 `package.json` 中 `version` 字段，手动升级：

```bash
npm run release:patch   # 0.0.1 → 0.0.2
npm run release:minor   # 0.0.1 → 0.1.0
```

> 脚本自动更新 `package.json` version（`--no-git-tag-version` 避免自动打 tag，tag 由 CI 的 tag push 触发）。

### package.json 中的 scripts（与已有脚本合并）

```json
{
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "lint": "eslint src --ext ts",
    "package": "vsce package -o extension.vsix",
    "install-local": "npm run compile && npm run package && code --install-extension extension.vsix --force",
    "release:patch": "npm version patch --no-git-tag-version && npm run compile",
    "release:minor": "npm version minor --no-git-tag-version && npm run compile"
  }
}
```

> CI 工作流重写已有的 `.github/workflows/ci.yml`，替换为本文档中的完整流水线。

---

## .env 配置方案

### 方案选择

VSCode 插件**不使用** `.env` 文件，因为：

1. VSCode 插件运行在扩展宿主进程中，`.env` 文件不生效
2. 有内置的 `contributes.configuration` 更规范
3. 配置可在 VSCode 设置 UI 中直接修改

### 如何等效 .env

做一份**配置模板文件** `.env.example`，仅为文档说明用，不参与运行时：

```env
# 助手服务（记事本 + Todo）
HELPER_SERVER_URL=http://localhost:3000
HELPER_API_TOKEN=

# 股票服务
STOCK_SERVER_URL=https://your-server.com
STOCK_API_TOKEN=your-token-here
STOCK_REFRESH_INTERVAL=300
```

实际运行时通过 `vscode.workspace.getConfiguration()` 读取，用户在配置面板中填入（与 `.env.example` 对应）。

### 配置流转

```
┌─────────────────────────────────────┐
│  .env.example                       │
│  （文档，说明有哪些配置项）            │
├──────────────────┬──────────────────┤
│                  │                  │
│  首次安装时       │  运行时           │
│  用户手动填写      │  getConfiguration │
│  VSCode 设置页    │                  │
└──────────────────┴──────────────────┘
```

---

## 服务端 npm 发布

### personal-helper-server

一个 npm 包同时包含 note 和 todo 两个服务，通过 CLI 子命令区分：

```
personal-helper-server/
├── package.json      ← name: "personal-helper-server"
├── bin/
│   └── phelper.js    ← #!/usr/bin/env node，入口
├── src/
│   ├── server.ts     ← 启动 note + todo 两个 HttpServer
│   ├── note-store.ts ← 笔记 JSON 读写
│   ├── note-router.ts
│   ├── todo-store.ts ← Todo JSON 读写
│   ├── todo-router.ts
│   └── cli.ts        ← CLI 命令解析，子命令分发
├── data/
│   ├── notes.default.json
│   └── todos.default.json
├── .env.example
└── README.md         ← 详细说明书，openclaw 用
```

### package.json bin 配置

```json
{
  "name": "personal-helper-server",
  "version": "0.1.0",
  "bin": {
    "phelper": "./bin/phelper.js"
  },
  "scripts": {
    "publish:npm": "npm publish --access public"
  },
  "files": ["bin/", "src/", "data/", ".env.example"]
}
```

### CLI 子命令

```
phelper note create "标题" "内容"
phelper note list
phelper note delete <id>
phelper note search <keyword>

phelper todo create "工作" "待办内容"
phelper todo list [--group 工作]
phelper todo check <id>
phelper todo delete <id>
phelper todo list-groups

phelper server start          # 启动服务（:3000，/api/notes + /api/todos 同一进程）
phelper health                # 检查服务健康状态
```

### 发布命令

```bash
cd personal-helper-server && npm publish --access public
```

### openclaw 安装

```bash
npm install -g personal-helper-server

# 启动服务
phelper server start

# CLI 管理
phelper note create "标题" "内容"
phelper todo create "工作" "完成文档"
```

---

## 整体发布流程总览

```
┌─────────────────────────────────────────────────────┐
│                   开发者推送代码                       │
│                                                      │
│  ┌──────────────┐    ┌───────────────────┐          │
│  │ VSCode 插件   │    │ helper-server      │          │
│  │ (本仓库)      │    │ (独立仓库)          │          │
│  └──────┬───────┘    └────────┬──────────┘          │
│         │                     │                      │
│  ┌──────┴───────┐    ┌───────┴──────────┐          │
│  │ GitHub Actions│    │ npm publish       │          │
│  │ → .vsix      │    │ → npm 包          │          │
│  │ → Marketplace│    │                   │          │
│  └──────┬───────┘    └───────┬──────────┘          │
│         │                     │                      │
│  ┌──────┴───────┐    ┌───────┴──────────┐          │
│  │ VSCode 市场   │    │ npm install -g    │          │
│  │ 在线安装      │    │ → phelper         │          │
│  │              │    │ → openclaw 管理    │          │
│  └──────────────┘    └──────────────────┘          │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │     用户设备                                   │   │
│  │                                               │   │
│  │  VSCode 插件 ◄── HTTP ──► phelper server       │   │
│  │                   ├── /api/notes                 │   │
│  │                   └── /api/todos                 │   │
│  │                   all on :3000                   │   │
│  │                                               │   │
│  │  VSCode 插件 ◄── HTTP ──► stock-analyzer      │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 待补充项

- [x] ~~note-service 和 todo-service 是否需要独立仓库~~ → 合并为一个 `personal-helper-server` 包
- [x] ~~`personal-helper-server` 放哪~~ → 放本仓库 `/services/personal-helper-server/` 下，一起管理
- [x] ~~stock-analyzer 是否不需要 npm 发布~~ → 已部署在服务器，插件只消费 REST API，无需 npm 发布
- [x] ~~`.env.example` 放在插件根目录还是独立文档~~ → 放插件根目录，开发时一眼可见，发布时不打进 .vsix（已配 .vscodeignore）
- [x] ~~是否需要自动更新检查~~ → 暂不做，后续按需加
