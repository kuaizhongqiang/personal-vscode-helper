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

/* ─── Simple memory cache ─── */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_OVERVIEW = 60_000; // 60s
const CACHE_TTL_BATCH = 30_000;    // 30s

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T, ttl: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

/* ─── Helpers ─── */

async function dsaFetch<T = any>(path: string): Promise<T> {
  const url = `${DSA_API_URL}${path.startsWith('/') ? path : '/' + path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`dsa-server error: ${res.status} ${res.statusText}`);
  }
  return res.json();
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
 * GET /overview — 组合 dsa-server 数据生成股池总览
 *
 * dsa-server 实际路由:
 *   GET /pools              → 池列表
 *   GET /pools/{id}/stocks  → 池内股票
 *   GET /stocks/{code}/quote → 个股行情
 *
 * 逐个组合，60s 内存缓存
 */
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const cached = getCached<StockPool[]>('overview');
    if (cached) {
      res.json(cached);
      return;
    }

    const poolData = await dsaFetch<{ pools: any[] }>('/pools');
    const pools: any[] = poolData.pools || [];

    const results: StockPool[] = await Promise.all(
      pools.map(async (pool: any) => {
        try {
          const stockListData = await dsaFetch<{ stocks: any[] }>(`/pools/${pool.id}/stocks`);
          const rawStocks: any[] = stockListData.stocks || [];

          const stocks: PoolStock[] = await Promise.all(
            rawStocks.map(async (s: any) => {
              try {
                const quote = await dsaFetch<any>(`/stocks/${s.stock_code}/quote`);
                return {
                  code: s.stock_code,
                  name: s.stock_name || quote.stock_name || '',
                  current_price: quote.current_price ?? null,
                  change_pct: quote.change_percent ?? null,
                  quote_time: quote.update_time ?? null,
                  analysis_summary: s.analysis_summary ?? null,
                  action_label: s.action_label ?? null,
                  ideal_buy: s.ideal_buy ?? null,
                  stop_loss: s.stop_loss ?? null,
                  take_profit: s.take_profit ?? null,
                };
              } catch {
                return {
                  code: s.stock_code,
                  name: s.stock_name || '',
                  current_price: null,
                  change_pct: null,
                  quote_time: null,
                  analysis_summary: null,
                  action_label: null,
                  ideal_buy: null,
                  stop_loss: null,
                  take_profit: null,
                };
              }
            }),
          );

          return {
            name: pool.name || '',
            description: pool.description || '',
            updated_at: pool.updated_at || '',
            stocks,
          };
        } catch {
          return { name: pool.name || '', description: '', updated_at: '', stocks: [] };
        }
      }),
    );

    setCache('overview', results, CACHE_TTL_OVERVIEW);
    res.json(results);
  } catch (err: any) {
    console.error('[stocks/overview] Failed:', err.message);
    res.status(502).json({ error: '代理上游失败', detail: err.message });
  }
});

/**
 * GET /batch?codes=600519,300750,... — 批量行情
 *
 * dsa-server 无独立批量接口，逐个调用 /stocks/{code}/quote 聚合
 * 30s 内存缓存（基于排序后的 code 列表）
 */
router.get('/batch', async (req: Request, res: Response) => {
  try {
    const codesParam = req.query.codes as string;
    if (!codesParam) {
      res.status(400).json({ error: '缺少查询参数 codes' });
      return;
    }

    const codes = codesParam.split(',').map(c => c.trim()).filter(Boolean);
    if (codes.length === 0) {
      res.status(400).json({ error: 'codes 参数为空' });
      return;
    }

    // Use sorted deduplicated codes as cache key
    const cacheKey = `batch:${[...new Set(codes)].sort().join(',')}`;
    const cached = getCached<any[]>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const quotes = await Promise.all(
      codes.map(async (code) => {
        try {
          const quote = await dsaFetch<any>(`/stocks/${code}/quote`);
          return {
            code: quote.stock_code,
            name: quote.stock_name,
            current_price: quote.current_price,
            change_pct: quote.change_percent,
            quote_time: quote.update_time,
          };
        } catch {
          return null;
        }
      }),
    );

    const result = quotes.filter(Boolean);
    setCache(cacheKey, result, CACHE_TTL_BATCH);
    res.json(result);
  } catch (err: any) {
    console.error('[stocks/batch] Failed:', err.message);
    res.status(502).json({ error: '代理上游失败', detail: err.message });
  }
});

export default router;
