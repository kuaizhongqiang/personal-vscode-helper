import { Router, Request, Response } from 'express';

const router = Router();

const DSA_SERVER_URL = process.env.DSA_SERVER_URL || 'http://localhost:8000';

/* ─── Types ─── */

interface PoolStock {
  code: string;
  name: string;
  current_price: number | null;
  change_pct: number | null;
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

/* ─── Helpers ─── */

async function dsaFetch(path: string): Promise<any> {
  const res = await fetch(`${DSA_SERVER_URL}/api/v1${path}`);
  if (!res.ok) {
    throw new Error(`dsa-server error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/* ─── Routes ─── */

/**
 * GET /overview — 代理 dsa-server 的股池+行情数据，组装成扩展所需的格式
 *
 * 内部流程:
 *   1. GET /pools → 股池列表
 *   2. 对每个股池 GET /pools/{pool_id}/stocks → 股票列表
 *   3. 对每支股票 GET /stocks/{code}/quote → 行情
 */
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const poolData = await dsaFetch('/pools');
    const pools: any[] = poolData.pools || [];

    const results: StockPool[] = await Promise.all(
      pools.map(async (pool: any) => {
        try {
          const stockListData = await dsaFetch(`/pools/${pool.id}/stocks`);
          const rawStocks: any[] = stockListData.stocks || [];

          const stocks: PoolStock[] = await Promise.all(
            rawStocks.map(async (s: any) => {
              try {
                const quote = await dsaFetch(`/stocks/${s.stock_code}/quote`);
                return {
                  code: s.stock_code,
                  name: s.stock_name || quote.stock_name || '',
                  current_price: quote.current_price ?? null,
                  change_pct: quote.change_percent ?? null,
                  analysis_summary: s.analysis_summary ?? null,
                  action_label: s.action_label ?? null,
                  ideal_buy: s.ideal_buy ?? null,
                  stop_loss: s.stop_loss ?? null,
                  take_profit: s.take_profit ?? null,
                };
              } catch {
                // 单支股票失败不影响其他
                return {
                  code: s.stock_code,
                  name: s.stock_name || '',
                  current_price: null,
                  change_pct: null,
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

    res.json(results);
  } catch (err: any) {
    console.error('[stocks/overview] Failed:', err.message);
    res.status(502).json({ error: '代理上游失败', detail: err.message });
  }
});

export default router;
