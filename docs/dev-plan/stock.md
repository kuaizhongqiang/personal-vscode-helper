# 股票列表模块开发计划

## Goal

在 VSCode 侧边栏或底部面板展示自选股列表，数据从 `stock-analyzer` 服务拉取。**外观必须低调**，不用红绿色块、K 线图、跳动数字等看板风格，混在编辑器里不引人注目。

---

## 数据来源

调用 `stock-analyzer` 的 REST API：

| 接口 | 用途 | 刷新频率 |
|------|------|----------|
| `GET /api/v1/pools/overview` | 获取股池 + 股票列表 + 分析摘要 | 5-10 分钟 |
| `GET /api/v1/stocks/batch?codes=xxx` | 批量刷新实时行情 | 30-60 秒 |
| `GET /api/health` | 服务存活检查 | 60 秒 |

---

## 数据模型（插件内）

```typescript
interface StockItem {
    code: string;              // 600519
    name: string;              // 贵州茅台
    pool: string;              // 所属股池名
    currentPrice: number;      // 最新价
    changePct: number;         // 涨跌幅 %
    quoteTime: string;         // 行情时间
    analysisSummary: string | null;  // AI 分析摘要
    actionLabel: string | null;      // 操作建议
    idealBuy: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
}
```

---

## UI 设计（低调风格）

### 核心原则

- **禁用**：红绿色块背景、闪动动画、K 线图
- **使用**：纯文本、单色、灰阶为主
- 涨跌只用 `+1.2%` 和 `-0.8%` 文字，不用红绿
- 字体大小与 VSCode 侧边栏一致

### 列表视图

```
┌─────────────────────────────┐
│  📊 自选列表     🟢 在线     │
├─────────────────────────────┤
│  强势股跟踪                  │
│  ─────────────────────────  │
│  600519  贵州茅台            │
│  1800.00  +0.84%  持有       │
│  1750  |  1650  |  1950      │
│  ─────────────────────────  │
│  300750  宁德时代            │
│   220.50  -1.20%  —          │
│    —   |   —   |   —        │
│                             │
│  自选观察                    │
│  ─────────────────────────  │
│  000001  平安银行            │
│    12.30  +0.15%  观望       │
│    —   |   —   |   —        │
│                             │
└─────────────────────────────┘
```

### 设计要点

- **分组头**：用字体加粗区分，不用底色
- **价格**：正常字重，不放闪
- **涨跌幅**：纯文本，无颜色
- **操作建议**（actionLabel）：显示原文，如「持有」「观望」「买入」
- **策略价位**：一行小字 `买入价位 | 止损价位 | 止盈价位`，灰色
- **null 值处理**：显示 `—`（短横线）

### 展开详情（点击 TreeItem 触发）

点击股票条目 → 打开 WebView 面板显示完整行情 + 分析细节。

```
  600519  贵州茅台
  ┌───────────────────────────┐
  │ 最新价：1800.00            │
  │ 涨跌幅：+0.84%             │
  │ 昨收：1785.00  开盘：1780.00│
  │ 最高：1810.00  最低：1775.00│
  │ 量比：1.2  换手：0.35%      │
  │ 市盈率：30.5  市净率：8.2    │
  │ 分析：技术面向好，建议持有   │
  │ 操作：持有                  │
  │ 买入：1750  止损：1650      │
  │ 止盈：1950                  │
  └───────────────────────────┘
```

> 方案已定：用 WebView，不用 QuickPick（QuickPick 排版能力有限）

---

## 状态栏聚合

状态栏右侧显示简要行情（默认最多 3 只）：

```
📊 茅台 1800.00 +0.84% | 宁德 220.50 -1.20% | 平安 12.30 +0.15%
```

> 超过 3 只时截断，hover 显示完整列表。可通过配置项 `maxStatusBarStocks` 调整数量。

---

## 轮询刷新策略

```typescript
class StockPoller {
    private overviewTimer: NodeJS.Timer | null;
    private batchTimer: NodeJS.Timer | null;

    start() {
        // 立即请求一次概览
        this.fetchOverview();

        // 每 5 分钟刷新概览（分析数据）
        this.overviewTimer = setInterval(
            () => this.fetchOverview(),
            config.stockRefreshInterval * 1000  // 默认 300s
        );

        // 每 60 秒刷新实时行情
        this.batchTimer = setInterval(
            () => this.fetchBatchQuotes(),
            60000
        );
    }

    stop() {
        clearInterval(this.overviewTimer);
        clearInterval(this.batchTimer);
    }
}
```

---

## null 值兜底

| 字段为 null | 显示 |
|------------|------|
| `analysisSummary` | `—` 或隐藏行 |
| `actionLabel` | `—` 或隐藏行 |
| `idealBuy / stopLoss / takeProfit` | `—` |
| `quoteTime` 超过 15 分钟 | 显示 ⚠ 数据延迟 |

---

## 实现方式选择

**方案：TreeView**

股票列表用 `vscode.window.createTreeView` + `TreeDataProvider`，天然低调，自动匹配 VSCode 主题，无需 HTML/CSS。

```typescript
class StockDataProvider implements vscode.TreeDataProvider<StockTreeItem> {
    getChildren(element?: StockTreeItem): StockTreeItem[] {
        // 根：返回股池作为一级节点
        // 股池节点：返回股票作为二级节点
    }
}
```

好处：
- 外观与 VSCode 侧边栏完全一致，低调自然
- 无需写 WebView HTML
- 自动支持主题适配

---

## 入口

- 命令面板：`personal-vscode-helper.openStock`
- 侧边栏图标
- 快捷键：待定

---

## 实现步骤

1. 搭建 `stockClient`，验证 API 连通
2. 实现 `StockDataProvider` + `TreeView`
3. 实现 `StockPoller` 定时刷新
4. 处理 null 值和数据延迟
5. 点击展开详情（TreeItem 的 command 打开详情 WebView 或 QuickPick）
6. 状态栏聚合接入

---

## 验收标准

- [ ] 侧边栏显示股池分组和股票列表
- [ ] 外观低调：无红绿色块、无跳动动画、无 K 线图
- [ ] 涨跌幅仅文本显示
- [ ] 行情定时自动刷新
- [ ] 服务离线时显示离线状态
- [ ] null 值正常兜底
- [ ] 行情超过 15 分钟显示延迟提示
