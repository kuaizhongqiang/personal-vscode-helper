---
name: "stock_analyzer"
description: "分析股票和市场。通过 dsa MCP 工具调用股票分析、大盘复盘、行情查询、股池管理、语义搜索等功能。"
---

# 股票分析器

通过 MCP 工具调用 daily_stock_analysis 的核心分析能力。

## 可用工具 (MCP)

### 📊 股票分析与行情

| 工具名 | 说明 |
|--------|------|
| `analyze_stock` | 异步提交股票分析，返回 job_id |
| `check_job_status` | 查询分析任务状态 |
| `run_analysis_sync` | 同步运行分析（1-3 分钟），直接返回结果 |
| `get_stock_quote` | 获取实时行情快照（价格、涨跌幅、成交量） |
| `resolve_stock` | 解析股票名称/代码（"茅台" → "600519"） |

### 📈 大盘与策略

| 工具名 | 说明 |
|--------|------|
| `market_status` | 查询今日哪些市场（CN/HK/US）开市 |
| `run_market_review` | 运行全市场大盘复盘（1-3 分钟） |
| `list_strategies` | 列出所有可用交易策略 |

### 🏊 股池管理

| 工具名 | 说明 |
|--------|------|
| `pool_list` | 列出所有股池（自选股分组） |
| `pool_create` | 创建新的股池 |
| `pool_delete` | 删除股池 |
| `pool_add_stock` | 向股池添加股票 |
| `pool_remove_stock` | 从股池移除股票 |
| `pool_list_stocks` | 查看股池内股票列表 |

### 🔍 语义搜索

| 工具名 | 说明 |
|--------|------|
| `semantic_search` | 语义搜索已索引的分析、新闻、对话（自然语言查询） |
| `vector_index_status` | 查看向量索引状态统计 |
| `vector_rebuild_index` | 重建向量索引 |

### 📜 历史管理

| 工具名 | 说明 |
|--------|------|
| `history_stats` | 获取历史分析统计信息 |
| `history_export` | 导出分析历史（JSON 格式） |
| `history_prune` | 清理指定天数前的分析历史 |

## 工作流程

### 单股分析
1. 用 `resolve_stock` 解析股票名称（可选）
2. 用 `run_analysis_sync` 直接分析并获取结果
3. 从结果中提取 `advice`、`trend`、`score`

### 股池批量分析
1. 用 `pool_list` 查看现有股池
2. 用 `pool_add_stock` 添加股票到股池
3. 对池内股票逐一调用 `run_analysis_sync`

### 语义搜索历史
1. 用 `semantic_search` 输入自然语言查询（如"茅台近期走势"）
2. 按相似度排序的结果中包含原文和来源

### 大盘复盘
1. 用 `market_status` 查看开市情况
2. 用 `run_market_review` 运行复盘

## 远程访问与认证

远程（非本机）调用 REST API 需要配置 API Token 认证。

### 服务端配置

在 `.env` 中设置：

```env
API_TOKEN=your-secure-token-here
```

### 客户端调用

所有远程 API 请求必须在请求头中携带 Token：

```bash
curl -H "Authorization: Bearer your-secure-token-here" \
  https://your-server.com/api/v1/pools/overview
```

> 本机 CLI/MCP 调用无需认证，只有远程 HTTP 请求需要 Token。

### 远程股池总览（VSCode 插件用）

```bash
curl -H "Authorization: Bearer your-token" \
  https://your-server.com/api/v1/pools/overview
```

返回嵌套结构：股池 → 股票列表 → 每只股票的实时行情 + 分析摘要 + 策略价位。
详见 [`docs/remote-data-api.md`](docs/remote-data-api.md)。

---

## REST API

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/v1/analysis/analyze` | POST | 触发分析 |
| `/api/v1/analysis/status/{task_id}` | GET | 异步任务状态 |
| `/api/v1/agent/chat` | POST | Agent 策略问股 |
| `/api/v1/pools` | GET/POST | 股池管理 |
| `/api/v1/pools/overview` | GET | 远程股池总览（嵌套数据，需认证） |
| `/api/v1/search/semantic` | GET | 语义搜索 |
| `/api/v1/history/export` | GET | 导出分析历史 |
| `/api/health` | GET | 健康检查 |

## 股票代码格式

| 类型 | 格式 | 示例 |
|------|------|------|
| A股 | 6位数字 | `600519`、`000001`、`300750` |
| 港股 | hk + 5位数字 | `hk00700`、`hk09988` |
| 美股 | 1-5 字母 | `AAPL`、`TSLA` |
| 美股指数 | 缩写 | `SPX`、`DJI`、`IXIC` |
