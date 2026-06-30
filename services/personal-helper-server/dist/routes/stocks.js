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
 *   1. Fi-PM /api/v1/pools              → 股池列表
 *   2. Fi-PM /api/v1/pools/{id}/stocks  → 股票列表
 *   3. Fi-PM /api/v1/analysis/batch     → 按股票代码获取最新分析
 *   4. 腾讯财经 qt.gtimg.cn             → 实时价格（仅交易时段）
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
        const poolData = await fipFetch('/api/v1/pools');
        const pools = poolData.data || [];
        // Step 2: 获取每个池的股票列表，收集所有股票代码
        const allCodes = [];
        const poolStocksMap = new Map();
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
        // Step 5: 组装结果
        const results = pools.map((p) => {
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
                    ideal_buy: null,
                    stop_loss: null,
                    take_profit: null,
                };
            });
            return {
                name: p.name || '',
                description: p.desc || '',
                updated_at: p.updatedAt || '',
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
