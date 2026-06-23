import { Router, Request, Response } from 'express';

const router = Router();

/* ─── Config ─── */

const RAW_DSA_API = process.env.DSA_API_URL;
const RAW_DSA_SERVER = process.env.DSA_SERVER_URL;
const DSA_API_URL: string = (() => {
  if (RAW_DSA_API) return RAW_DSA_API.replace(/\/+$/, '');
  if (RAW_DSA_SERVER) return `${RAW_DSA_SERVER.replace(/\/+$/, '')}/api/v1`;
  return 'http://localhost:8000/api/v1';
})();

/* ─── Cache ─── */

const cache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 60s

function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/* ─── Helpers ─── */

async function dsaFetch<T = any>(path: string, timeoutMs = 10000): Promise<T> {
  const url = `${DSA_API_URL}${path.startsWith('/') ? path : '/' + path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`dsa-server error: ${res.status} ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ─── Market Hours ─── */

function isMarketOpen(): boolean {
  const now = new Date();
  if (now.getDay() === 0 || now.getDay() === 6) return false;
  const total = now.getHours() * 60 + now.getMinutes();
  return (total >= 570 && total < 690) || (total >= 780 && total < 900);
}

/* ─── Tencent Real-time Price ─── */

interface TencentQuote {
  price: number;
  changePct: number;
  time: string;
}

function toTencentCode(code: string): string {
  if (code.startsWith('6')) return `sh${code}`;
  if (code.startsWith('0') || code.startsWith('3')) return `sz${code}`;
  if (code.startsWith('4') || code.startsWith('8')) return `bj${code}`;
  return code;
}

async function fetchTencentPrices(codes: string[]): Promise<Map<string, TencentQuote>> {
  if (codes.length === 0) return new Map();

  const tencentCodes = codes.map(toTencentCode);
  const url = `http://qt.gtimg.cn/q=${tencentCodes.join(',')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    const buf = await res.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const text = decoder.decode(buf);

    const result = new Map<string, TencentQuote>();
    for (const line of text.trim().split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/"(.+)"/);
      if (!match) continue;
      const fields = match[1].split('~');
      if (fields.length < 50) continue;

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
  } finally {
    clearTimeout(timer);
  }
}

/* ─── Types ─── */

interface PoolStock {
  code: string;
  name: string;
  current_price: number | null;
  change_pct: number | null;
  quote_time: string | null;
  analysis_summary: string | null;
  action_label: string | null;
  ideal_buy: number | null;
  stop_loss: number | null;
  take_profit: number | null;
}

interface StockPool {
  name: string;
  description: string;
  updated_at: string;
  stocks: PoolStock[];
}

/* ─── Routes ─── */

/**
 * GET /overview — 股池总览（结构 + 分析结果 + 实时价格）
 *
 * 优先调用 dsa-server /pools/overview 获取结构和分析数据，
 * 再用腾讯财经实时价格覆盖（仅交易时段）。
 * 若 /pools/overview 超时，降级为 /pools + /pools/{id}/stocks。
 *
 * 缓存: 60s
 */
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const cached = getCache<StockPool[]>('overview');
    if (cached) {
      res.json(cached);
      return;
    }

    // 尝试从 dsa-server /pools/overview 获取完整数据
    let pools: any[] = [];
    let poolStocksMap = new Map<string | number, any[]>();
    let overviewSucceeded = false;

    try {
      const overviewData = await dsaFetch<any[]>('/pools/overview', 15000);
      if (Array.isArray(overviewData) && overviewData.length > 0) {
        pools = overviewData;
        overviewSucceeded = true;
      }
    } catch {
      console.log('[stocks/overview] /pools/overview 超时，降级到组合模式');
    }

    if (!overviewSucceeded) {
      // 降级模式: /pools + /pools/{id}/stocks（无分析字段）
      const poolListData = await dsaFetch<{ pools: any[] }>('/pools');
      pools = (poolListData.pools || []).map((p: any) => ({
        name: p.name || '',
        description: p.description || '',
        updated_at: p.updated_at || '',
        id: p.id,
        stocks: [] as any[],
      }));

      for (const pool of pools) {
        try {
          const stockListData = await dsaFetch<{ stocks: any[] }>(`/pools/${pool.id}/stocks`);
          const rawStocks = stockListData.stocks || [];
          poolStocksMap.set(pool.id, rawStocks);
          pool.stocks = rawStocks.map((s: any) => ({
            code: s.code,
            name: s.name || '',
            current_price: null,
            change_pct: null,
            quote_time: null,
            analysis_summary: null,
            action_label: null,
            ideal_buy: null,
            stop_loss: null,
            take_profit: null,
          }));
        } catch {
          pool.stocks = [];
        }
      }

      // 收集股票代码用于腾讯价格
      const allCodes: string[] = [];
      for (const pool of pools) {
        for (const s of pool.stocks) {
          if (s.code) allCodes.push(s.code);
        }
      }

      if (isMarketOpen() && allCodes.length > 0) {
        const priceMap = await fetchTencentPrices([...new Set(allCodes)]);
        for (const pool of pools) {
          for (const s of pool.stocks) {
            const p = priceMap.get(s.code);
            if (p) {
              s.current_price = p.price;
              s.change_pct = p.changePct;
              s.quote_time = p.time;
            }
          }
        }
      }

      setCache('overview', pools);
      res.json(pools);
      return;
    }

    // 正常模式: /pools/overview 返回的已经是 PoolOverviewPoolItem[] 格式
    // 提取股票代码 → 腾讯实时价格 → 覆盖
    const allCodes: string[] = [];
    for (const pool of pools) {
      const stocks: any[] = pool.stocks || [];
      for (const s of stocks) {
        if (s.code) allCodes.push(s.code);
      }
    }

    if (isMarketOpen() && allCodes.length > 0) {
      const priceMap = await fetchTencentPrices([...new Set(allCodes)]);
      for (const pool of pools) {
        const stocks: any[] = pool.stocks || [];
        for (const s of stocks) {
          const p = priceMap.get(s.code);
          if (p) {
            s.current_price = p.price;
            s.change_pct = p.changePct;
            s.quote_time = p.time;
          }
        }
      }
    }

    setCache('overview', pools);
    res.json(pools);
  } catch (err: any) {
    console.error('[stocks/overview] Failed:', err.message);
    res.status(502).json({ error: '代理上游失败', detail: err.message });
  }
});

export default router;
