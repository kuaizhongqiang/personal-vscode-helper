# 审核报告：迁移至 Fi-Pool-Manager 方案

> 审核对象：`docs/dev-plan/migrate-to-fi-pool-manager.md`
> 审核日期：2026-06-30

---

## 一、总体评价

方案整体质量较高：背景分析全面，方案对比充分，数据映射详尽，改动范围控制合理。**方向正确，修正问题后可进入实施阶段。**

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构合理性 | ★★★★☆ | 方案A最优，改动范围可控 |
| 数据映射完整性 | ★★★★★ | 字段级映射详尽，覆盖全部核心结构 |
| 实施计划可行性 | ★★★☆☆ | 时间估算合理，但缺少并行化建议 |
| 文档内部一致性 | ★★☆☆☆ | 端点表格、代码示例、架构图三处矛盾 |
| 风险应对 | ★★☆☆☆ | 缺少回滚方案和降级策略 |
| 可操作性 | ★★★☆☆ | 修正不一致后可执行，预计 3-4 天 |

---

## 二、必须修正的不一致（阻塞）

### 问题1：REST 端点表格与代码示例互相矛盾

**位置：** 第 3.1 节（第 92-165 行）

端点表格列出了 5 个端点，但只有 `/api/v1/pools` 和 `/api/v1/pools/:id/stocks` 有对应代码；其余 3 个端点无实现。同时，代码中出现的 `/api/v1/history` 和 `/api/v1/stocks/{code}/quote` 端点在表格中不存在。

| 来源 | 端点 | 状态 |
|------|------|------|
| 表格 | `GET /api/v1/pools` | ✅ 有代码 |
| 表格 | `GET /api/v1/pools/:id/stocks` | ✅ 有代码 |
| 表格 | `GET /api/v1/stocks/:code/analysis` | ❌ 无代码实现 |
| 表格 | `GET /api/v1/stocks/:code/daily` | ❌ 无代码实现 |
| 表格 | `GET /api/v1/overview` | ❌ 无代码实现 |
| 代码 | `GET /api/v1/history` | ❌ 表格中不存在 |
| 代码 | `GET /api/v1/stocks/{code}/quote` | ❌ 表格中不存在 |

此外，代码示例中 `/api/v1/stocks/{code}/quote` 的路由匹配使用了字符串模板语法 `{code}`，在实际 HTTP 路由中无法工作。

**建议：** 统一为以下 6 个端点，确保表格和代码一一对应：

| 端点 | 功能 |
|------|------|
| `GET /api/v1/pools` | 股池列表 |
| `GET /api/v1/pools/:id/stocks` | 池中股票 |
| `GET /api/v1/history` | 最近分析摘要（按 code 去重取最新） |
| `GET /api/v1/stocks/:code/quote` | 个股行情（OHLCV + 腾讯实时价格） |
| `GET /api/v1/stocks/:code/analysis` | 个股最新分析报告 |
| `GET /api/v1/overview` | 聚合总览（可选，简化调用） |

---

### 问题2：`stockDetailPanel.ts` 改造路径不明确

**位置：** 第 3.4 节（第 214-230 行）+ 第 8 节（第 458-459 行）

文档中出现了三个互相矛盾的改造方向：

- **选项 a**：直连 Fi-Pool-Manager 的 `/api/v1/stocks/:code/quote`（端点表暗示）
- **选项 b**：通过 personal-helper-server 新增代理端点 `/api/stocks/detail/:code`（3.4 节推荐）
- **选项 c**：改用 `helperClient` 替代 `stockClient`（架构图暗示）

这三处说法不一致，实施时会让人困惑。

**建议：** 明确选择选项 b（走 personal-helper-server 代理），理由：

1. 插件层统一入口（只需 `helperClient`，不再需要 `stockClient`）
2. `stockServerUrl` 配置项可平滑废弃，简化用户配置
3. 便于在代理层补充 PE/PB 等 Fi-Pool-Manager 缺失字段

---

### 问题3：`endpoints.ts` 改动级别标注错误

**位置：** 第 4 节变更清单（第 244 行）

当前标注为"可选修改"，但若选择问题2的选项 b，`getStockClient()` 将不再需要，`endpoints.ts` **必须修改**。

**建议：** 变更标注为"修改"：
- 删除 `getStockClient()` 及相关单例逻辑
- 或保留但将 `stockServerUrl` 默认值从 `https://your-server.com` 改为 `http://localhost:3005`（指向 personal-helper-server），保持向后兼容

---

### 问题4：`/api/v1/overview` 与 personal-helper-server 聚合逻辑冲突

**位置：** 第 3.2 节 + 第 8 节

如果 Fi-Pool-Manager 提供聚合端点 `/api/v1/overview`，personal-helper-server 的 `GET /api/stocks/overview` 可以从 4 次 HTTP 调用减少到 2 次（1 次 overview + 1 次腾讯价格）。但 8 节架构图仍然画了 4 次独立调用：

```
HTTP GET Fi-Pool-Manager /api/v1/pools       ← 仍独立调用
HTTP GET Fi-Pool-Manager /api/v1/pools/:id/stocks ← 仍独立调用
HTTP GET Fi-Pool-Manager /api/v1/history     ← 仍独立调用
```

**建议：** 二选一：
- **如果做聚合**：personal-helper-server 只调用 `/api/v1/overview` + 腾讯价格
- **如果不做聚合**：从端点表中移除 `/api/v1/overview`

---

### 问题5：Drizzle ORM 查询语法有误

**位置：** 第 148-155 行

```typescript
// ❌ 当前写法：sql 模板 + 聚合函数混合在 orderBy 中无法正确工作
.orderBy(sql`max(${dailyAnalysisReport.date}) DESC`).all();
```

Drizzle 的 `sql` 模板在 `.orderBy()` 中配合 `.groupBy()` 时可能产生意外的 SQL。正确的做法是使用子查询或独立计算最大值。

**建议：** 修改为子查询方式取每个 code 的最新记录：

```typescript
// ✅ 每个 code 取 MAX(date) 记录
const subQuery = db.select({
  code: dailyAnalysisReport.code,
  maxDate: sql<string>`MAX(${dailyAnalysisReport.date})`.as('max_date'),
}).from(dailyAnalysisReport).groupBy(dailyAnalysisReport.code).as('latest');

const rows = db.select().from(dailyAnalysisReport)
  .innerJoin(subQuery, and(
    eq(dailyAnalysisReport.code, subQuery.code),
    eq(dailyAnalysisReport.date, subQuery.maxDate),
  )).all();
```

---

## 三、遗漏的风险项（重要）

### 问题6：缺少回滚方案

当前 dsa-server 和 Fi-Pool-Manager 是完全不同的两个服务，一旦 Fi-Pool-Manager REST 端点上线后出现严重 bug，没有文档化的回滚路径。

**建议：** 在第 7 节增加回滚流程：

```
回滚步骤：
1. personal-helper-server 同时保留 dsaFetch() 和 fipFetch()
2. 通过 .env 中的 DATA_SOURCE 环境变量控制：
   DATA_SOURCE=dsa → 使用 dsaFetch()（回滚）
   DATA_SOURCE=fip → 使用 fipFetch()（默认）
3. 回滚操作只需修改 .env 并重启服务
4. 稳定运行 2 周后移除 dsaFetch() 代码
```

---

### 问题7：缺少 Fi-Pool-Manager 宕机降级策略

当前 `stocks.ts` 对 dsa-server 有 10s 超时处理，切换后需要同等的容错能力。

**建议：** 在第 3.2 节增加降级逻辑：
- `fipFetch()` 超时/错误时，返回缓存数据（如果缓存未过期）
- 缓存过期时返回空数据 + `{ _error: "data_source_unavailable" }` 标记
- 前端 `stockPoller.ts` 根据错误标记显示"数据源不可用"提示而非崩溃

---

### 问题8：`package.json` 配置变更未列入变更清单

第 208-210 行讨论了 `stockServerUrl` 配置项处理，但在第 4 节文件变更清单中缺失。

**建议：** 在第 4 节变更清单中增加：

```
| package.json | 修改 | stockServerUrl 默认值 → http://localhost:3005 / 或新增 fiPoolManagerUrl |
```

---

### 问题9：PE/PB 数据源未验证

第 5.4 节指出 Fi-Pool-Manager 无 PE/PB 数据，需从腾讯补充。但腾讯 `qt.gtimg.cn` 接口是否返回 `pe_ratio`、`pb_ratio` 未经验证。

**建议：** 在第 7 节"数据完整性"中增加验证任务：使用腾讯 API 请求一只股票，确认返回字段是否包含 PE/PB。若腾讯接口也不返回，需要：
- 从其他数据源补充（如东方财富、新浪财经）
- 或接受 detail panel 中 PE/PB 字段为空

---

## 四、次要建议

### 10. 端口规划冲突风险

Fi-Pool-Manager HTTP server 当前运行在哪个端口？VSCode 配置中 `helperServerUrl` 默认值为 `http://localhost:3000`（端口 3000）。如果 Fi-Pool-Manager 也使用 3000，会产生冲突。

**建议：** 
- Fi-Pool-Manager 使用 3001（或通过环境变量 `PORT` 配置）
- personal-helper-server 使用 3005（当前配置）
- 在文档 3.3 节明确标注两个端口

### 11. `.env.example` 缺少关键配置

当前 `.env.example` 只包含 `PORT`、`HELPER_DATA_DIR`、`API_TOKEN`，缺少 `DSA_API_URL`（当前在用）和 `FI_POOL_MANAGER_URL`（即将新增）。

**建议：** 更新 `.env.example` 为：

```ini
PORT=3005
API_TOKEN=your-secure-token-here

# 数据源选择（二选一）
FI_POOL_MANAGER_URL=http://localhost:3001   # 新数据源（推荐）
# DSA_API_URL=http://localhost:8000/api/v1  # 旧数据源（过渡期保留）
```

### 12. 测试数据准备

第三阶段测试需要 Fi-Pool-Manager 数据库中有完整数据（pools、stocks、daily_analysis_report 三表有真实记录）。

**建议：** 提前准备 seed 脚本或在 Fi-Pool-Manager 项目中执行一轮完整分析。

### 13. 代码示例中路由匹配模式不通用

`server.ts` 中的 `if (poolsMatch)` 模式（第 136-142 行）对单个参数有效，但端点增多后应使用更通用的路由匹配。

**建议：** 如果端点超过 3 个，考虑引入轻量路由库（如 `find-my-way` 或手写简单的路径参数解析）。

---

## 五、优先级矩阵

| 优先级 | 问题编号 | 问题 | 影响 |
|--------|----------|------|------|
| 🔴 P0 | #1 | 端点表格与代码矛盾 | 实施时无法确定端点列表 |
| 🔴 P0 | #2 | stockDetailPanel 路径不明确 | 实施时方向混乱 |
| 🔴 P0 | #5 | Drizzle 查询语法错误 | 代码不可运行 |
| 🟡 P1 | #3 | endpoints.ts 改动级别错标 | 变更清单不准 |
| 🟡 P1 | #4 | overview 聚合逻辑冲突 | 重复调用或遗漏 |
| 🟡 P1 | #6 | 缺少回滚方案 | 上线出问题无法快速恢复 |
| 🟡 P1 | #7 | 缺少降级策略 | 数据源宕机影响用户体验 |
| 🟢 P2 | #8 | package.json 未入清单 | 文档完整性 |
| 🟢 P2 | #9 | PE/PB 数据源未验证 | 功能缺失风险 |
| 🟢 P2 | #10-13 | 次要建议 | 优化项 |

---

## 六、结论

**方案方向正确，推荐实施。** 修正 5 个 P0/P1 问题后即可进入开发，其余问题可在实施中逐步处理。预计：
- 文档修正：0.5 天
- 阶段一（Fi-Pool-Manager REST 端点）：1-2 天
- 阶段二（personal-helper-server 切换）：1 天
- 阶段三（测试验证）：1 天
- 阶段四（清理文档）：0.5 天
- **总计：4-5 天**（与原方案估算基本一致）
