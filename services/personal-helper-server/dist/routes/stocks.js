import { Router } from 'express';
const router = Router();
/* ─── Config ─── */
const RAW_DSA_API = process.env.DSA_API_URL;
const RAW_DSA_SERVER = process.env.DSA_SERVER_URL;
const DSA_API_URL = (() => {
    if (RAW_DSA_API)
        return RAW_DSA_API.replace(/\/+$/, '');
    if (RAW_DSA_SERVER)
        return `${RAW_DSA_SERVER.replace(/\/+$/, '')}/api/v1`;
    return 'http://localhost:8000/api/v1';
})();
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
async function dsaFetch(path, timeoutMs = 10000) {
    const url = `${DSA_API_URL}${path.startsWith('/') ? path : '/' + path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok)
            throw new Error(`dsa-server error: ${res.status} ${res.statusText}`);
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
 * 数据来源（均为纯 DB 查询，毫秒级）:
 *   1. dsa-server /pools              → 股池列表
 *   2. dsa-server /pools/{id}/stocks  → 股票列表
 *   3. dsa-server /api/v1/history     → 分析结果（按股票代码去重取最新）
 *   4. 腾讯财经 qt.gtimg.cn           → 实时价格（仅交易时段）
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
        // Step 1: 获取股池列表
        const poolData = await dsaFetch('/pools');
        const pools = poolData.pools || [];
        // Step 2: 获取每个池的股票列表，收集所有股票代码
        const allCodes = [];
        const poolStocksMap = new Map();
        for (const pool of pools) {
            try {
                const stockListData = await dsaFetch(`/pools/${pool.id}/stocks`);
                const rawStocks = stockListData.stocks || [];
                poolStocksMap.set(pool.id, rawStocks);
                for (const s of rawStocks) {
                    if (s.code)
                        allCodes.push(s.code);
                }
            }
            catch {
                poolStocksMap.set(pool.id, []);
            }
        }
        // Step 3: 获取分析结果（从 /api/v1/history 批量拉取，按 code 去重取最新）
        const analysisMap = new Map();
        if (allCodes.length > 0) {
            try {
                // 历史列表接口: GET /api/v1/history?limit=200
                // 返回所有分析记录（纯 DB），在内存中按 stock_code 去重
                const historyData = await dsaFetch('/history?limit=200');
                const records = historyData?.records || [];
                for (const r of records) {
                    const code = r.stock_code || r.code;
                    if (!code)
                        continue;
                    // 只保留每个股票的最新一条
                    const existing = analysisMap.get(code);
                    if (!existing || (r.created_at && r.created_at > existing.created_at)) {
                        analysisMap.set(code, r);
                    }
                }
            }
            catch (err) {
                console.log('[stocks/overview] /history 获取失败:', err.message);
            }
        }
        // Step 4: 交易时段内获取腾讯实时价格
        let priceMap = new Map();
        if (isMarketOpen() && allCodes.length > 0) {
            priceMap = await fetchTencentPrices([...new Set(allCodes)]);
        }
        // Step 5: 组装结果
        const results = pools.map((pool) => {
            const rawStocks = poolStocksMap.get(pool.id) || [];
            const stocks = rawStocks.map((s) => {
                const price = priceMap.get(s.code);
                const analysis = analysisMap.get(s.code);
                return {
                    code: s.code,
                    name: s.name || '',
                    current_price: price?.price ?? null,
                    change_pct: price?.changePct ?? null,
                    quote_time: price?.time ?? null,
                    analysis_summary: analysis?.analysis_summary ?? null,
                    action_label: analysis?.action_label ?? null,
                    ideal_buy: null, // 历史列表不含策略价位，需单独调详情接口
                    stop_loss: null,
                    take_profit: null,
                };
            });
            return {
                name: pool.name || '',
                description: pool.description || '',
                updated_at: pool.updated_at || '',
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
export default router;
