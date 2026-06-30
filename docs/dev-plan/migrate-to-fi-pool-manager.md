# 升级方案：从 daily_stock_analysis 切换到 Fi-Pool-Manager

## 1. 背景与现状

### 当前架构

```
VSCode Extension (personal-vscode-helper)
  │
  ├─ stockPoller.ts → helperClient → GET /api/stocks/overview (port 3005)
  │     └─ personal-helper-server (routes/stocks.ts)
  │           ├─ HTTP GET dsa-server /pools
  │           ├─ HTTP GET dsa-server /pools/{id}/stocks
  │           ├─ HTTP GET dsa-server /history?limit=200
  │           └─ HTTP GET qt.gtimg.cn (腾讯实时价格)
  │
  └─ stockDetailPanel.ts → stockClient → GET dsa-server /api/v1/stocks/{code}/quote
```

**现状总结：**
- `personal-helper-server` 通过 REST API 调用 `daily_stock_analysis`（Python FastAPI，端口 8000）
- 使用 3 个端点：`/pools`、`/pools/{id}/stocks`、`/history`
- 腾讯实时价格由 `personal-helper-server` 直接获取
- 当前 `.env` 配置：`DSA_API_URL=http://localhost:8000/api/v1`

### Fi-Pool-Manager 差异分析

| 维度 | daily_stock_analysis (dsa-server) | Fi-Pool-Manager |
|------|-----------------------------------|-----------------|
| 语言/框架 | Python FastAPI | TypeScript, Drizzle ORM + SQLite |
| 接口形式 | 完整 REST API（30+ 端点） | 程序化 API（TypeScript functions）+ MCP 插件 |
| HTTP 服务 | 完整 FastAPI 应用 | 仅 3 端点（`/`, `/health`, `/status`） |
| 数据存储 | SQLAlchemy + 数据库 | better-sqlite3 + Drizzle ORM |
| 股池/股票 CRUD | REST 端点 | `managerTools` + `queryTools` |
| 分析报告 | `/history` 返回分析记录 | `queryTools.getAnalysisReport()` / `getFinalReport()` |
| 实时价格 | 部分端点内嵌 | 独立的 `dailyInfoService.refreshData()` |
| K 线数据 | `/stocks/{code}/history` | `queryTools.getDailyInfo()` |
| 部署模式 | 独立 HTTP 服务 | CLI / MCP 插件 / 可嵌入库 |

**核心问题：** Fi-Pool-Manager **没有**供外部 HTTP 调用的股池/股票 REST 接口。它通过 TypeScript 函数暴露能力。

---

## 2. 方案对比

### 方案 A：在 Fi-Pool-Manager 中添加 REST API 层（推荐）

在 Fi-Pool-Manager 的 HTTP server 中增加股池概览、股票查询、报告查询等 REST 端点。
`personal-helper-server` 继续通过 HTTP 调用，改动最小。

| 优点 | 缺点 |
|------|------|
| 当前架构不变，只需改 URL | 需要修改 Fi-Pool-Manager 代码 |
| VSCode 插件层无需改动 | 需要定义统一的数据契约 |
| 两服务解耦 | 增加网络开销 |

### 方案 B：personal-helper-server 直接 npm link Fi-Pool-Manager

`personal-helper-server` 将 `fi-pool-server` 添加为依赖，直接调用其程序化 API。

| 优点 | 缺点 |
|------|------|
| 无网络开销，性能最好 | 两项目耦合，版本管理复杂 |
| 可复用全部 Fi-Pool-Manager 能力 | 需要打通 monorepo / npm link |
| SQLite 数据库可直接访问 | 部署时需要同时维护两个项目 |

### 方案 C：调用 Fi-Pool-Manager CLI

通过 `child_process.exec()` 调用 `fi-pool` CLI 命令并解析 stdout。

| 优点 | 缺点 |
|------|------|
| 无需修改 Fi-Pool-Manager | 进程启动开销大 |
| 严格解耦 | 难以处理错误和流式数据 |

---

**推荐方案 A**，理由：
1. 保持 HTTP 架构一致性（personal-helper-server 本身就是 HTTP 网关）
2. 数据契约清晰，便于测试和版本迭代
3. VSCode 插件层零改动
4. Fi-Pool-Manager 已有 HTTP server 框架，扩展 REST 端点工作量可控

---

## 3. 详细改造步骤（方案 A）

### 3.1 Fi-Pool-Manager 侧：新增 REST API 端点

在 `packages/server/src/server.ts` 的 HTTP server 中增加以下端点：

| 端点 | 方法 | 功能 | 对应内部调用 |
|------|------|------|-------------|
| `GET /api/v1/pools` | GET | 列出所有股池 | `queryTools.listPools()` |
| `GET /api/v1/pools/:id/stocks` | GET | 获取池中股票 | `queryTools.getPoolStocks(id)` |
| `GET /api/v1/stocks/:code/analysis` | GET | 获取最新分析报告 | `queryTools.getAnalysisReport(code, latestDate)` |
| `GET /api/v1/stocks/:code/daily` | GET | 获取日 K 线数据 | `queryTools.getDailyInfo(code, start, end)` |
| `GET /api/v1/overview` | GET | 股池总览（聚合） | 聚合 pools + stocks + latest analysis |

**数据模型映射：**

```
当前 dsa-server 返回格式 → Fi-Pool-Manager 数据来源
─────────────────────────────────────────────────

/pools 返回:
  { id, name, description, updated_at }
  → pool 表: pool.id, pool.name, pool.desc, pool.updatedAt

/pools/{id}/stocks 返回:
  { code, name }
  → pool_stock JOIN stock: stock.code, stock.name, stock.currentPrice

/history?limit=200 返回:
  { stock_code, analysis_summary, action_label, created_at }
  → daily_analysis_report 表: code, summary, signals (含 action), createdAt
  → 或 final_report 表: code, summary, createdAt (更完整)

/stocks/{code}/quote 返回:
  { pre_close, open, high, low, volume_ratio, turnover_rate, pe_ratio, pb_ratio, update_time }
  → daily_info 表最近一日: open, high, low, close
  → 腾讯实时报价需单独获取（或复用 Fi-Pool-Manager 的 refreshData）
```

**新增端点实现要点（`server.ts` 中增加路由）：**

```typescript
// 新增：股池列表
case '/api/v1/pools': {
  const pools = await queryTools.listPools();
  res.end(JSON.stringify({ pools }));
  break;
}

// 新增：池中股票
const poolsMatch = url.pathname.match(/^\/api\/v1\/pools\/(\d+)\/stocks$/);
if (poolsMatch) {
  const poolId = parseInt(poolsMatch[1], 10);
  const stocks = await queryTools.getPoolStocks(poolId);
  res.end(JSON.stringify({ stocks }));
  break;
}

// 新增：最近分析摘要（按 code 去重取最新）
case '/api/v1/history': {
  // 从 daily_analysis_report 取最新记录，按 code 去重
  const db = getDatabase();
  const rows = db.select({
    code: dailyAnalysisReport.code,
    summary: dailyAnalysisReport.summary,
    signals: dailyAnalysisReport.signals,
    date: dailyAnalysisReport.date,
  }).from(dailyAnalysisReport)
    .groupBy(dailyAnalysisReport.code)
    .orderBy(sql`max(${dailyAnalysisReport.date}) DESC`).all();
  res.end(JSON.stringify({ records: rows }));
  break;
}

// 新增：个股详情（K 线 + 腾讯实时价格）
case '/api/v1/stocks/{code}/quote': {
  // 直接从腾讯获取实时报价
  // + 最近一日的 daily_info 作为行情数据
  break;
}
```

### 3.2 personal-helper-server 侧：修改 stocks.ts

**修改点 1：重命名配置**
- `DSA_API_URL` → `FI_POOL_MANAGER_URL`
- 默认值：`http://localhost:3000`

**修改点 2：数据源切换**
原有的 `dsaFetch()` 改为 `fipFetch()`，指向 Fi-Pool-Manager 的新端点。

**修改点 3：字段映射适配**

| dsa-server 字段 | Fi-Pool-Manager 对应字段 | 处理方式 |
|-----------------|------------------------|---------|
| `pool.id` | `pool.id` | 保持不变 |
| `pool.name` | `pool.name` | 不变 |
| `pool.description` | `pool.desc` | 字段名映射 |
| `pool.updated_at` | `pool.updatedAt` | 字段名映射 |
| `stock.code` | `stock.code` | 不变 |
| `stock.name` | `stock.name` | 不变 |
| 价格字段 | `stock.currentPrice` / Tencent | 腾讯取价逻辑可复用 |
| `analysis_summary` | `dailyAnalysisReport.summary` / `finalReport.summary` | 映射 |
| `action_label` | `dailyAnalysisReport.signals` 中的操作信号 | 需要 JSON 解析 |
| `ideal_buy/stop_loss/take_profit` | 当前两系统均为 null/待实现 | 不变 |

**修改点 4：Tencent 实时价格复用**
- 当前 `stocks.ts` 已有从腾讯 gtimg.cn 获取实时价格的逻辑
- 切换后此逻辑可保留（或改用 Fi-Pool-Manager 的 `refreshData` 获取最新价格）
- 推荐：继续保留腾讯直取逻辑（已在 service 层实现，稳定可靠）

### 3.3 配置更新

**`.env` 文件（`services/personal-helper-server/.env`）：**
```ini
# 原有配置移除
# DSA_API_URL=http://localhost:8000/api/v1

# 新增配置
FI_POOL_MANAGER_URL=http://localhost:3000
```

**VSCode 插件配置（`package.json` 的 contributes.configuration）：**
- 可保留 `stockServerUrl` 配置项，修改其默认值说明
- 或新增 `fiPoolManagerUrl` 配置项

### 3.4 VSCode 插件层：最小化改动

**现状：**
- `stockPoller.ts` 通过 `getHelperClient()` → `GET /api/stocks/overview` → personal-helper-server
- `stockDetailPanel.ts` 通过 `getStockClient()` → `GET /api/v1/stocks/{code}/quote` → dsa-server

**修改：**
1. `stockPoller.ts` **无需改动** — 它调用的是 personal-helper-server 的 `/api/stocks/overview`，该接口由后端切换到 Fi-Pool-Manager 数据源
2. `stockDetailPanel.ts` 需要将 `getStockClient()` 的 URL 指向 Fi-Pool-Manager（或 personal-helper-server 新增的个股详情代理接口）

**推荐：** 在 personal-helper-server 中新增代理端点（而不是让插件直连 Fi-Pool-Manager），保持统一入口：
```typescript
// services/personal-helper-server/src/routes/stocks.ts 新增
router.get('/detail/:code', async (req, res) => {
  // 从 Fi-Pool-Manager 获取股票详情
  // 或从腾讯直取实时行情
  // 返回与现有 stockDetailPanel 兼容的格式
});
```

---

## 4. 变更清单

### 文件级别变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `Fi-Pool-Manager/packages/server/src/server.ts` | **修改** | 新增 REST 端点（pools、stocks、history、overview） |
| `personal-vscode-helper/services/personal-helper-server/src/routes/stocks.ts` | **重写** | 数据源从 dsa-server 改为 Fi-Pool-Manager |
| `personal-vscode-helper/services/personal-helper-server/.env` | **修改** | `DSA_API_URL` → `FI_POOL_MANAGER_URL` |
| `personal-vscode-helper/src/views/stockDetailPanel.ts` | **修改** | 个股详情 API 指向 personal-helper-server 代理（或 Fi-Pool-Manager） |
| `personal-vscode-helper/src/server/endpoints.ts` | **可选修改** | 新增 Fi-Pool-Manager 客户端配置 |
| `personal-vscode-helper/docs/roadmap.md` | **更新** | 更新数据源描述 |
| `personal-vscode-helper/docs/server/SKILL.md` | **更新** | 更新 MCP 工具描述 |
| `personal-vscode-helper/services/personal-helper-server/.env.example` | **更新** | 更新配置模板 |

### 保持不变的文件

| 文件 | 说明 |
|------|------|
| `src/views/stockPoller.ts` | 继续调用 personal-helper-server，无改动 |
| `src/views/stockTree.ts` | 数据模型兼容，无需改动 |
| `src/server/client.ts` | ApiClient 通用，无需改动 |
| `src/server/errors.ts` | 错误处理通用 |
| `src/extension.ts` | 入口文件无改动 |
| `services/personal-helper-server/src/index.ts` | Express 应用结构不变 |

---

## 5. 数据映射细节

### 5.1 股池列表映射

```typescript
// dsa-server /pools 返回:
interface DsaPool {
  id: number;
  name: string;
  description: string;
  updated_at: string;
}

// Fi-Pool-Manager listPools() 返回:
interface FipPool {
  id: number;
  name: string;
  desc: string;           // ← 字段名不同
  poolAnalysis: string;
  poolSignal: number;
  createdAt: string;
  updatedAt: string;       // ← 字段名不同
  stockCount: number;      // ← 新增字段（附带股票数量）
}

// 映射逻辑:
const mappedPool = {
  id: fip.id,
  name: fip.name,
  description: fip.desc,   // 重命名
  updated_at: fip.updatedAt, // 重命名
};
```

### 5.2 池中股票映射

```typescript
// dsa-server /pools/{id}/stocks 返回:
interface DsaPoolStock {
  code: string;
  name: string;
}

// Fi-Pool-Manager getPoolStocks(id) 返回:
interface FipPoolStock {
  code: string;
  name: string;
  currentPrice: number;   // ← 额外信息
  addedAt: string;        // ← 额外信息
}

// 映射: 直接兼容，字段可扩展
```

### 5.3 分析历史映射

```typescript
// dsa-server /history 返回:
interface DsaHistoryItem {
  stock_code: string;
  stock_name: string;
  analysis_summary: string;
  action_label: string;
  trend_prediction: string;
  sentiment_score: number;
  created_at: string;
}

// Fi-Pool-Manager dailyAnalysisReport 表:
interface FipAnalysisReport {
  code: string;
  date: string;
  summary: string;       // ← 对应 analysis_summary
  indicators: string;    // JSON 字符串
  signals: string;       // JSON 字符串（内含操作信号）
  createdAt: string;
}

// finalReport 表（更完整）:
interface FipFinalReport {
  code: string;
  date: string;
  summary: string;       // ← 结构化摘要（JSON）
  fullReport: string;    // 完整报告
  roleSummary: string;   // JSON 字符串
  createdAt: string;
}

// 映射逻辑:
// Fi-Pool-Manager 的 signals JSON 通常包含操作建议
// 需要解析 JSON 提取 action_label
```

### 5.4 个股行情映射

```typescript
// dsa-server /stocks/{code}/quote 返回:
interface DsaQuote {
  pre_close: number;
  open: number;
  high: number;
  low: number;
  current_price: number;
  volume_ratio: number;
  turnover_rate: number;
  pe_ratio: number;
  pb_ratio: number;
  update_time: string;
  change_percent: number;
}

// Fi-Pool-Manager:
// dailyInfoService.fetchRealTimeQuote(code) → { price, name }
// dailyInfoService.getDailyInfo(code, start, end) → OHLCV[]
//
// Fi-Pool-Manager 无 PE/PB 数据（仅技术面分析）
// 需从腾讯 API 补充获取
```

---

## 6. 实施步骤与优先级

### 第一阶段：Fi-Pool-Manager 新增 REST 端点（1-2 天）

1. 在 `server.ts` 中新增 `GET /api/v1/pools` 端点
2. 新增 `GET /api/v1/pools/:id/stocks` 端点
3. 新增 `GET /api/v1/history` 端点（按 code 去重取最新 dailyAnalysisReport）
4. 新增 `GET /api/v1/overview` 聚合端点（可选，简化客户端调用）
5. 测试验证数据返回正确

### 第二阶段：personal-helper-server 切换数据源（1 天）

1. 修改 `.env` 配置，添加 `FI_POOL_MANAGER_URL`
2. 重写 `routes/stocks.ts`，将 `dsaFetch()` 替换为 `fipFetch()`
3. 适配字段名映射（`description↔desc`, `updated_at↔updatedAt`）
4. 适配分析报告数据格式（从 `dailyAnalysisReport` 映射）
5. 保留现有腾讯实时价格获取逻辑
6. 新增个股详情代理端点

### 第三阶段：测试与验证（1 天）

1. 启动 Fi-Pool-Manager HTTP server
2. 启动 personal-helper-server
3. 验证 `/api/stocks/overview` 返回正确数据
4. 验证个股详情展示正常
5. 验证交易时段实时价格更新正常
6. 验证缓存机制正常工作

### 第四阶段：清理与文档（0.5 天）

1. 更新 `.env.example`
2. 更新 `docs/roadmap.md`
3. 更新 `docs/server/SKILL.md`
4. 移除对 dsa-server 的依赖描述

---

## 7. 风险与注意事项

### 数据完整性
- Fi-Pool-Manager 的 `dailyAnalysisReport` 使用 `indicators`（JSON）存结构化指标，`signals`（JSON）存信号
- 需要确认 `signals` JSON 中是否有 `action_label` 等价字段，或需要从 `summary` 文本中解析
- 备选：使用 `finalReport.summary` 作为 `analysis_summary`

### 实时价格
- Fi-Pool-Manager 也有腾讯实时报价能力（`fetchRealTimeQuote`）
- personal-helper-server 当前直接调用腾讯 API（`qt.gtimg.cn`）
- **建议保留现有直取逻辑**，避免重复调用与速率限制冲突

### 数据库路径
- Fi-Pool-Manager 的 SQLite 数据库路径在 `.env` 中配置（`DB_PATH`）
- personal-helper-server 需要知道数据库路径才能直连（如果选择方案 B）
- 方案 A 下无此问题（通过 HTTP 调用）

### 数据新鲜度
- dsa-server 的 `/history` 返回所有历史分析，客户端取最新一条
- Fi-Pool-Manager 的 `dailyAnalysisReport` 按 `(code, date)` 唯一，已有日期索引
- 建议 Fi-Pool-Manager 的新端点按 `code` 分组取 `MAX(date)` 来模拟 `/history`

---

## 8. 架构演进图

### 升级后架构

```
VSCode Extension (personal-vscode-helper)   ← 插件层无改动
  │
  ├─ stockPoller.ts → helperClient → GET /api/stocks/overview (port 3005)
  │     └─ personal-helper-server (routes/stocks.ts)           ← 修改
  │           ├─ HTTP GET Fi-Pool-Manager /api/v1/pools       ← 新增
  │           ├─ HTTP GET Fi-Pool-Manager /api/v1/pools/:id/stocks ← 新增
  │           ├─ HTTP GET Fi-Pool-Manager /api/v1/history     ← 新增
  │           └─ HTTP GET qt.gtimg.cn (腾讯实时价格)           ← 保留
  │
  └─ stockDetailPanel.ts → helperClient → GET /api/stocks/detail/:code  ← 新增代理
        └─ personal-helper-server → Fi-Pool-Manager + 腾讯补充
```
