# 配置页开发计划

## Goal

提供一个独立的配置面板，让用户设置各后端服务的地址和认证信息。打通插件和三个后端服务的连接基础。

---

## 配置项一览

```json
// package.json contributes.configuration
{
  "personal-vscode-helper.helperServerUrl": {
    "type": "string",
    "default": "http://localhost:3000",
    "description": "助手服务地址（记事本 + Todo）"
  },
  "personal-vscode-helper.helperApiToken": {
    "type": "string",
    "default": "",
    "description": "助手服务 Token"
  },
  "personal-vscode-helper.stockServerUrl": {
    "type": "string",
    "default": "https://your-server.com",
    "description": "股票分析服务地址"
  },
  "personal-vscode-helper.stockApiToken": {
    "type": "string",
    "default": "",
    "description": "股票分析服务 API Token"
  },
  "personal-vscode-helper.stockRefreshInterval": {
    "type": "number",
    "default": 300,
    "description": "股票行情刷新间隔（秒）"
  }
}
```

---

## 配置面板 UI

### 布局

```
┌──────────────────────────────────┐
│  ⚙️ 插件配置                      │
├──────────────────────────────────┤
│                                  │
│  📦 助手服务（记事本 + Todo）      │
│  ┌──────────────────────────────┐│
│  │ 服务器地址 [________________] ││
│  │ API Token [________________] ││
│  │ [🟢 连接正常]   [测试连接]    ││
│  └──────────────────────────────┘│
│                                  │
│  📊 股票服务                      │
│  ┌──────────────────────────────┐│
│  │ 服务器地址 [________________] ││
│  │ API Token [________________] ││
│  │ 刷新间隔   [____] 秒          ││
│  │ [🟢 连接正常]   [测试连接]    ││
│  └──────────────────────────────┘│
│                                  │
└──────────────────────────────────┘
```

### 交互要点

- 每个服务一个区块，包含地址、Token、连接状态
- **测试连接** 按钮触发对应服务的 `/api/health` 请求
- 连接状态实时显示绿灯/红灯
- 修改即保存到 `configuration`，无需手动确认
- Token 输入框用 `password` 类型

---

## 入口

- 命令面板：`personal-vscode-helper.openConfig`
- 快捷键：待定
- 侧边栏齿轮图标入口

---

## WebView ↔ Extension 通信

### Extension → WebView（初始数据）

```typescript
webview.postMessage({
  type: 'config',
  data: {
    helperServerUrl: '...',
    helperApiToken: '...',
    stockServerUrl: '...',
    stockApiToken: '...',
    stockRefreshInterval: 300
  }
});
```

### WebView → Extension（用户修改）

```typescript
// 修改配置
vscode.postMessage({ type: 'saveConfig', key: 'helperServerUrl', value: 'http://...' });

// 测试连接
vscode.postMessage({ type: 'testConnection', service: 'helper' });
vscode.postMessage({ type: 'testConnection', service: 'stock' });
```

### Extension → WebView（连接结果）

```typescript
webview.postMessage({
  type: 'connectionStatus',
  service: 'helper',       // 'helper' | 'stock'
  status: 'ok' | 'error',
  message: '连接超时'
});
```

---

## 实现步骤

1. 在 `package.json` 注册 `contributes.configuration` 全部配置项
2. 创建 `configPanel.ts`，实现 WebView Panel 的创建和生命周期
3. 编写配置页 HTML/JS，实现表单和测试连接按钮
4. 实现 `testConnection` 逻辑：发送 GET `/api/health`，根据响应更新状态
5. 注册命令 `personal-vscode-helper.openConfig`

---

## 验收标准

- [ ] 打开配置面板，助手服务和股票服务的地址、Token 可编辑
- [ ] 修改后自动保存到 VSCode 设置
- [ ] 测试连接按钮能正确展示各服务在线/离线状态
- [ ] 关闭面板再打开，配置不丢失
