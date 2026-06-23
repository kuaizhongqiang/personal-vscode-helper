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
 * GET /overview — 股池总览（含股票列表 + 分析结果）
 *
 * 数据来源:
 *   dsa-server /pools              → 股池列表
 *   dsa-server /pools/{id}/stocks  → 股票列表（含分析字段）
 *
 * 实时价格由后续步骤接入（腾讯接口），当前返回 null
 */
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const poolData = await dsaFetch<{ pools: any[] }>('/pools');
    const pools: any[] = poolData.pools || [];

    const results: StockPool[] = await Promise.all(
      pools.map(async (pool: any) => {
        try {
          const stockListData = await dsaFetch<{ stocks: any[] }>(`/pools/${pool.id}/stocks`);
          const rawStocks: any[] = stockListData.stocks || [];

          const stocks: PoolStock[] = rawStocks.map((s: any) => ({
            code: s.stock_code,
            name: s.stock_name || '',
            current_price: null,
            change_pct: null,
            quote_time: null,
            analysis_summary: s.analysis_summary ?? null,
            action_label: s.action_label ?? null,
            ideal_buy: s.ideal_buy ?? null,
            stop_loss: s.stop_loss ?? null,
            take_profit: s.take_profit ?? null,
          }));

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

    res.json(results);
  } catch (err: any) {
    console.error('[stocks/overview] Failed:', err.message);
    res.status(502).json({ error: '代理上游失败', detail: err.message });
  }
});

export default router;
