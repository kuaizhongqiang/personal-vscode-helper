# 远程数据拉取 API 文档

## 概述

从远程服务器拉取股池及股票分析数据的 REST API。所有远程请求**必须带认证**，本地 CLI/MCP 调用无需认证。

---

## 认证方式

**API Token 认证**，通过请求头传递：

```
Authorization: Bearer <API_TOKEN>
```

**配置方法**：在服务端的 `.env` 文件中设置：

```env
API_TOKEN=your-secure-token-here
```

> 如果 `API_TOKEN` 未设置，所有远程请求**无需认证**即可访问（开发/调试用）。
> 如果 `API_TOKEN` 已设置，不带 Token 或 Token 错误的请求返回 `401 Unauthorized`。

---

## 主接口：股池总览

### `GET /api/v1/pools/overview`

获取所有股池及其内股票的最新行情、分析摘要和策略建议。

**请求示例：**

```bash
curl -H "Authorization: Bearer your-token" \
  https://your-server.com/api/v1/pools/overview
```

**响应结构：**

```json
[
  {
    "name": "强势股跟踪",
    "description": "近期突破的强势股",
    "updated_at": "2026-06-22T15:30:00",
    "stocks": [
      {
        "code": "600519",
        "name": "贵州茅台",
        "current_price": 1800.00,
        "change_pct": 0.84,
        "quote_time": "2026-06-22T14:30:00",
        "analysis_summary": "技术面向好，建议持有",
        "action_label": "持有",
        "ideal_buy": 1750.00,
        "stop_loss": 1650.00,
        "take_profit": 1950.00
      },
      {
        "code": "300750",
        "name": "宁德时代",
        "current_price": 220.50,
        "change_pct": -1.20,
        "quote_time": "2026-06-22T14:30:00",
        "analysis_summary": null,
        "action_label": null,
        "ideal_buy": null,
        "stop_loss": null,
        "take_profit": null
      }
    ]
  }
]
```

**字段说明：**

| 层级 | 字段 | 类型 | 说明 |
|------|------|------|------|
| 股池 | `name` | string | 股池名称 |
| 股池 | `description` | string | 股池描述 |
| 股池 | `updated_at` | string (ISO8601) | 股池最后更新时间 |
| 股池 | `stocks` | array | 股池内股票列表 |
| 股票 | `code` | string | 股票代码（如 `600519`） |
| 股票 | `name` | string | 股票名称 |
| 股票 | `current_price` | float | 最新价 |
| 股票 | `change_pct` | float | 涨跌幅（相对于前一交易日收盘价的百分比） |
| 股票 | `quote_time` | string (ISO8601) | 行情时间戳，用于判断数据新鲜度 |
| 股票 | `analysis_summary` | string | 最近一次分析的结论摘要（`null` 表示尚未分析） |
| 股票 | `action_label` | string | 最近一次分析的操作建议（枚举值见下表，`null` 表示尚未分析） |
| 股票 | `ideal_buy` | float | 最近一次分析给出的理想买入价位（`null` 表示尚未分析） |
| 股票 | `stop_loss` | float | 最近一次分析给出的止损价位（`null` 表示尚未分析） |
| 股票 | `take_profit` | float | 最近一次分析给出的止盈价位（`null` 表示尚未分析） |

### action_label 枚举值

| 值 | 含义 | 说明 |
| --- | --- | --- |
| `持有` | Hold | 继续持有，当前不宜操作 |
| `买入` | Buy | 建议建仓买入 |
| `加仓` | Add | 建议增持 |
| `减持` | Reduce | 建议减仓 |
| `卖出` | Sell | 建议清仓离场 |
| `观望` | Watch | 暂不操作，等待信号明确 |
| `回避` | Avoid | 风险警示，不建议介入 |

> 如果服务端在后续版本中新增枚举值，前端应做好未知值的兜底展示。

### `analysis_summary` / `action_label` / 策略价位的来源说明

- 这些字段均来自该股票**最近一次成功完成的 LLM 分析**。
- 每次新分析会**覆盖**旧值，不保留多版本历史。
- 如果某只股票从未分析过，或最近一次分析失败，以上字段均为 `null`。
- 如果只需要获取分析历史的多版本记录，请使用 `/api/v1/history` 系列的接口。

---

## 批量行情接口

### `GET /api/v1/stocks/batch?codes=600519,300750,000001`

专供插件轮询刷新使用，一次查询多只股票的精简行情数据。

**请求示例：**

```bash
curl -H "Authorization: Bearer your-token" \
  "https://your-server.com/api/v1/stocks/batch?codes=600519,300750,000001"
```

**响应：**

```json
[
  {
    "code": "600519",
    "name": "贵州茅台",
    "current_price": 1800.00,
    "change_pct": 0.84,
    "quote_time": "2026-06-22T14:30:00"
  },
  {
    "code": "300750",
    "name": "宁德时代",
    "current_price": 220.50,
    "change_pct": -1.20,
    "quote_time": "2026-06-22T14:30:00"
  }
]
```

> 如果某个股票代码不存在或查询失败，该条目不会出现在结果中。

---

## 辅助接口：单只股票行情

### `GET /api/v1/stocks/{stock_code}/quote`

**请求示例：**

```bash
curl -H "Authorization: Bearer your-token" \
  https://your-server.com/api/v1/stocks/600519/quote
```

**响应：**

```json
{
  "stock_code": "600519",
  "stock_name": "贵州茅台",
  "current_price": 1800.00,
  "change_pct": 0.84,
  "pre_close": 1785.00,
  "open": 1780.00,
  "high": 1810.00,
  "low": 1775.00,
  "volume": 3200000,
  "amount": 576000000,
  "volume_ratio": 1.2,
  "turnover_rate": 0.35,
  "pe_ratio": 30.5,
  "pb_ratio": 8.2,
  "total_mv": 2260000000000,
  "circ_mv": 2260000000000,
  "high_52w": 2100.00,
  "low_52w": 1500.00,
  "update_time": "2026-06-22 14:30:00"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `stock_code` | string | 股票代码 |
| `stock_name` | string | 股票名称 |
| `current_price` | float | 最新价 |
| `change_pct` | float | 涨跌幅（相对于前一交易日收盘价的百分比） |
| `pre_close` | float | 前一交易日收盘价 |
| `open` | float | 开盘价 |
| `high` | float | 最高价 |
| `low` | float | 最低价 |
| `volume` | int | 成交量（股） |
| `amount` | float | 成交额（元） |
| `volume_ratio` | float | 量比 |
| `turnover_rate` | float | 换手率（%） |
| `pe_ratio` | float | 市盈率（动态） |
| `pb_ratio` | float | 市净率 |
| `total_mv` | float | 总市值（元） |
| `circ_mv` | float | 流通市值（元） |
| `high_52w` | float | 52 周最高价 |
| `low_52w` | float | 52 周最低价 |
| `update_time` | string | 行情时间 |

---

## 辅助接口：健康检查

### `GET /api/health`

无需认证，用于检测服务是否存活：

```bash
curl https://your-server.com/api/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-06-22T10:00:00"
}
```

> **说明**：健康检查路径为 `/api/health` 而非 `/api/v1/health`，与业务接口路径版本不同。可接受此差异或自行决定是否统一。

---

## 错误码

| HTTP 状态码 | 说明 |
|-------------|------|
| `200` | 成功 |
| `400` | 请求参数错误 |
| `401` | 未认证（Token 缺失或错误） |
| `404` | 资源不存在 |
| `500` | 服务器内部错误 |

**401 响应示例：**

```json
{
  "detail": "Invalid or missing API token"
}
```

---

## VSCode 插件集成建议

1. **服务器地址配置**：在 VSCode 插件设置中添加 `serverUrl` 和 `apiToken` 配置项
2. **定时刷新**：
   - 股池总览（含分析数据）建议每 **5-10 分钟**轮询 `/api/v1/pools/overview`
   - 批量实时行情建议每 **30-60 秒**轮询 `/api/v1/stocks/batch` 更新价格
3. **显示顺序**：按股池分组展示，每个股池内股票按 `change_pct` 降序排列可突出重点
4. **null 值处理**：
   - `analysis_summary` 为 `null` → 显示"等待分析"
   - `action_label` 为 `null` → 不显示操作标签
   - 策略价位为 `null` → 不显示或显示"-"
5. **行情新鲜度**：利用 `quote_time` 判断数据是否陈旧。超过 15 分钟无更新的行情，建议显示"数据延迟"提示
6. **action_label 兼容性**：展示 `action_label` 时，遇到未知枚举值建议直接显示原文，不要因识别失败而崩溃

**VSCode 配置示例：**

```json
{
  "stockAnalyzer.serverUrl": "https://your-server.com",
  "stockAnalyzer.apiToken": "your-token-here",
  "stockAnalyzer.refreshInterval": 300
}
```
