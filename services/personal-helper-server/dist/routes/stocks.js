import { Router } from 'express';
const router = Router();
/* ─── Config ─── */
const FI_POOL_MANAGER_URL = (process.env.FI_POOL_MANAGER_URL || 'http://localhost:3721').replace(/\/+$/, '');
/* ─── Cache ─── */
const cache = new Map();
const CACHE_TTL_MS = 60_000; // 60s
function getCache(key) {
    const entry = cache.get(key);
    if (entry && Date.now() < entry.expiresAt)
        return entry.data;
    cache.delete(key);
    return null;
}
function setCache(key, data) {
    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}
/* ─── Helpers ─── */
async function fipFetch(path, timeoutMs = 10000) {
    const url = `${FI_POOL_MANAGER_URL}${path.startsWith('/') ? path : '/' + path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok)
            throw new Error(`Fi-Pool-Manager error: ${res.status} ${res.statusText}`);
        return res.json();
    }
    finally {
        clearTimeout(timer);
    }
}
/* ─── Market Hours ─── */
function isMarketOpen() {
    const now = new Date();
    if (now.getDay() === 0 || now.getDay() === 6)
        return false;
    const total = now.getHours() * 60 + now.getMinutes();
    return (total >= 570 && total < 690) || (total >= 780 && total < 900);
}
function toTencentCode(code) {
    if (code.startsWith('6'))
        return `sh${code}`;
    if (code.startsWith('0') || code.startsWith('3'))
        return `sz${code}`;
    if (code.startsWith('4') || code.startsWith('8'))
        return `bj${code}`;
    return code;
}
async function fetchTencentPrices(codes) {
    if (codes.length === 0)
        return new Map();
    const tencentCodes = codes.map(toTencentCode);
    const url = `http://qt.gtimg.cn/q=${tencentCodes.join(',')}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        const buf = await res.arrayBuffer();
        const decoder = new TextDecoder('gbk');
        const text = decoder.decode(buf);
        const result = new Map();
        for (const line of text.trim().split('\n')) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            const match = trimmed.match(/"(.+)"/);
            if (!match)
                continue;
            const fields = match[1].split('~');
            if (fields.length < 50)
                continue;
            const rawCode = fields[2].trim();
            const price = parseFloat(fields[3]);
            const changePct = fields[32] ? parseFloat(fields[32]) : NaN;
            const time = fields[30];
            if (!isNaN(price)) {
                result.set(rawCode, {
                    price,
                    changePct: isNaN(changePct) ? 0 : changePct,
                    time,
                });
            }
        }
        return result;
    }
    finally {
        clearTimeout(timer);
    }
}
/* ─── Routes ─── */
/**
 * GET /overview — 股池总览
 *
 * 数据来源（Fi-Pool-Manager + 腾讯实时价格）:
 *   1. Fi-PM /api/v1/pools              → 股池列表（保证完整）
 *   2. Fi-PM /api/v1/overview           → 池级字段 + stocks[{code,name}]（消除 N+1）
 *   3. Fi-PM /api/v1/analysis/batch     → 按股票代码获取最新分析
 *   4. 腾讯财经 qt.gtimg.cn             → 实时价格（仅交易时段）
 *
 * 注意:
 *   - /api/v1/overview（Fi-PM#128）已内置 stocks 数组，无需逐池请求
 *   - 同时调用 /api/v1/pools 作为主数据源保障完整性（/api/v1/overview 可能过滤池）
 *   - 两者取并集合并：pools（完整性）+ overview（stocks + pool_signal/pool_analysis）
 *
 * 缓存: 60s
 */
router.get('/overview', async (_req, res) => {
    try {
        const cached = getCache('overview');
        if (cached) {
            res.json(cached);
            return;
        }
        // Step 1: 并行获取池列表 + 概览（含 stocks）
        const [poolsData, overviewData] = await Promise.all([
            fipFetch('/api/v1/pools').catch(() => ({ data: [] })),
            fipFetch('/api/v1/overview').catch(() => ({ data: { pools: [] } })),
        ]);
        // 主数据源: /api/v1/pools（保证完整性）
        const pools = poolsData.data || [];
        // 补充数据源: /api/v1/overview（含 stocks, pool_signal, pool_analysis）
        const overviewPoolsIdx = new Map((overviewData?.data?.pools || []).map(p => [p.id, p]));
        // Step 2: 收集股票代码（优先从 overview.stocks 取，消除 N+1；降级则逐池请求）
        const allCodes = [];
        const poolStocksMap = new Map();
        if (overviewPoolsIdx.size > 0) {
            // 主路径: overview 已内置 stocks（Fi-PM#128），零额外请求
            for (const p of pools) {
                const op = overviewPoolsIdx.get(p.id);
                const stocks = op?.stocks || [];
                poolStocksMap.set(p.id, stocks);
                for (const s of stocks) {
                    if (s.code)
                        allCodes.push(s.code);
                }
            }
        }
        else {
            // 降级路径: overview 不可用，逐池请求（N+1）
            for (const p of pools) {
                try {
                    const stockListData = await fipFetch(`/api/v1/pools/${p.id}/stocks`);
                    const rawStocks = stockListData.data || [];
                    poolStocksMap.set(p.id, rawStocks);
                    for (const s of rawStocks) {
                        if (s.code)
                            allCodes.push(s.code);
                    }
                }
                catch {
                    poolStocksMap.set(p.id, []);
                }
            }
        }
        // Step 3: 批量获取分析结果
        const analysisMap = new Map();
        if (allCodes.length > 0) {
            try {
                const uniqueCodes = [...new Set(allCodes)];
                const analysisData = await fipFetch(`/api/v1/analysis/batch?codes=${uniqueCodes.join(',')}`);
                const records = analysisData?.data || [];
                for (const r of records) {
                    if (r.code)
                        analysisMap.set(r.code, r);
                }
            }
            catch (err) {
                console.log('[stocks/overview] /analysis/batch 获取失败:', err.message);
            }
        }
        // Step 4: 交易时段内获取腾讯实时价格
        let priceMap = new Map();
        if (isMarketOpen() && allCodes.length > 0) {
            priceMap = await fetchTencentPrices([...new Set(allCodes)]);
        }
        // Step 5: 组装结果（池骨架来自 /api/v1/pools，stocks/概览字段来自 /api/v1/overview）
        const results = pools.map((p) => {
            const overviewPool = overviewPoolsIdx.get(p.id);
            const rawStocks = poolStocksMap.get(p.id) || [];
            const stocks = rawStocks.map((s) => {
                const price = priceMap.get(s.code);
                const analysis = analysisMap.get(s.code);
                // 从 signals JSON 中提取 action_label
                let actionLabel = null;
                if (analysis?.signals) {
                    try {
                        const signals = typeof analysis.signals === 'string'
                            ? JSON.parse(analysis.signals)
                            : analysis.signals;
                        actionLabel = signals.action || signals.action_label || null;
                    }
                    catch { /* ignore */ }
                }
                return {
                    code: s.code,
                    name: s.name || '',
                    current_price: price?.price ?? null,
                    change_pct: price?.changePct ?? null,
                    quote_time: price?.time ?? null,
                    analysis_summary: analysis?.summary ?? null,
                    action_label: actionLabel,
                    anomaly_score: analysis?.anomalyScore ?? null,
                    ideal_buy: null,
                    stop_loss: null,
                    take_profit: null,
                };
            });
            return {
                name: p.name || '',
                description: p.desc || '',
                updated_at: p.updatedAt || '',
                // pool_signal/pool_analysis 优先从 overview 取（含 stocks），否则用 /api/v1/pools 的值
                pool_signal: overviewPool?.poolSignal ?? p.poolSignal ?? null,
                pool_analysis: overviewPool?.poolAnalysis ?? p.poolAnalysis ?? null,
                stocks,
            };
        });
        setCache('overview', results);
        res.json(results);
    }
    catch (err) {
        console.error('[stocks/overview] Failed:', err.message);
        res.status(502).json({ error: '代理上游失败', detail: err.message });
    }
});
/**
 * GET /detail/:code — 个股详情
 *
 * 代理 Fi-Pool-Manager 的 /api/v1/stocks/:code/quote 接口，
 * 供 stockDetailPanel 使用（替代直调 dsa-server）。
 */
router.get('/detail/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const data = await fipFetch(`/api/v1/stocks/${code}/quote`);
        res.json(data);
    }
    catch (err) {
        console.error(`[stocks/detail] Failed for ${req.params.code}:`, err.message);
        res.status(502).json({ error: '获取个股详情失败', detail: err.message });
    }
});
/**
 * GET /status — Fi-Pool-Manager 健康检查
 */
router.get('/status', async (_req, res) => {
    try {
        const data = await fipFetch('/api/v1/status');
        res.json(data);
    }
    catch (err) {
        res.status(502).json({ error: 'Fi-Pool-Manager 不可达', detail: err.message });
    }
});
export default router;
