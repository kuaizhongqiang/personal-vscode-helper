# Issue: 新增 REST API 端点，供 personal-vscode-helper 迁移股池数据源使用

## 背景

[personal-vscode-helper](https://github.com/kuaizhongqiang/personal-vscode-helper) VSCode 扩展的股池总览功能，当前通过 `personal-helper-server` 调用 `daily_stock_analysis`（dsa-server，Python FastAPI）的 REST 接口获取数据。现计划将数据源切换到 Fi-Pool-Manager。

但由于 Fi-Pool-Manager 当前仅暴露程序化 TypeScript API（`queryTools`、`managerTools`）和 MCP 插件，**没有供外部 HTTP 调用的 REST 端点**，导致 `personal-helper-server` 无法直接集成。

## 请求

请在 Fi-Pool-Manager 的 HTTP server（`packages/server/src/server.ts`）中新增以下 REST 端点：

### 必选端点（用于股池总览）

| 端点 | 方法 | 用途 | 对应内部调用 |
|------|------|------|-------------|
| `GET /api/v1/pools` | GET | 列出所有股池（含股票数量） | `queryTools.listPools()` |
| `GET /api/v1/pools/:id/stocks` | GET | 获取指定股池的股票列表 | `queryTools.getPoolStocks(id)` |
| `GET /api/v1/history` | GET | 获取每只股票最新分析摘要（按 code 去重） | `dailyAnalysisReport` 表查询，按 code 分组取 MAX(date) |

### 可选端点（用于个股详情页）

| 端点 | 方法 | 用途 | 对应内部调用 |
|------|------|------|-------------|
| `GET /api/v1/stocks/:code/analysis` | GET | 获取单只股票最新分析报告 | `queryTools.getAnalysisReport(code, latestDate)` |
| `GET /api/v1/stocks/:code/quote` | GET | 获取个股实时行情（腾讯） | `dailyInfoService.fetchRealTimeQuote(code)` + `dailyInfoService.getDailyInfo()` |

## 期望数据格式

### `GET /api/v1/pools`

```json
{
  "pools": [
    {
      "id": 1,
      "name": "核心持仓",
      "desc": "长期关注",
      "updatedAt": "2026-06-30 10:00:00",
      "stockCount": 5
    }
  ]
}
```

### `GET /api/v1/pools/:id/stocks`

```json
{
  "stocks": [
    {
      "code": "600519",
      "name": "贵州茅台",
      "currentPrice": 1915.00
    }
  ]
}
```

### `GET /api/v1/history`

```json
{
  "records": [
    {
      "code": "600519",
      "summary": "主力资金持续流入，短期看多",
      "signals": "{\"action\":\"buy\",\"confidence\":0.8}",
      "date": "2026-06-29",
      "createdAt": "2026-06-29 18:00:00"
    }
  ]
}
```

## 实现参考

当前 `server.ts` 已有 3 个端点（`/`、`/health`、`/status`），采用原生 `http.createServer` + `switch/case` 路由。新端点可复用同一模式，或接入轻量 router。

## 关联

- 发起方：[personal-vscode-helper](https://github.com/kuaizhongqiang/personal-vscode-helper)
- 迁移方案：[migrate-to-fi-pool-manager.md](https://github.com/kuaizhongqiang/personal-vscode-helper/blob/main/docs/dev-plan/migrate-to-fi-pool-manager.md)
