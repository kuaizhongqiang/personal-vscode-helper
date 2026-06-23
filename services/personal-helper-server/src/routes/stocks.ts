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
const CACHE_TTL_MS = 60_000; // 60s for full overview

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

async function dsaFetch<T = any>(path: string): Promise<T> {
  const url = `${DSA_API_URL}${path.startsWith('/') ? path : '/' + path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`dsa-server error: ${res.status} ${res.statusText}`);
  return res.json();
}

/* ─── Market Hours ─── */

/**
 * A股交易时段: 周一至周五 9:30-11:30, 13:00-15:00
 * 非交易时段跳过实时行情API调用，返回缓存数据
 */
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
  time: string; // YYYYMMDDHHMMSS
}

function toTencentCode(code: string): string {
  if (code.startsWith('6')) return `sh${code}`;
  if (code.startsWith('0') || code.startsWith('3')) return `sz${code}`;
  if (code.startsWith('4') || code.startsWith('8')) return `bj${code}`;
  return code;
}

/**
 * 从腾讯财经批量获取实时价格
 * 接口: http://qt.gtimg.cn/q=sh600519,sz000001,...
 * 返回: v_sh600519="...~...~..."; （波浪号分隔，GBK编码）
 */
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
      const changePct = parseFloat(fields[32]);
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
 * GET /overview — 股池总览
 *
 * 数据来源:
 *   1. dsa-server /pools              → 股池列表
 *   2. dsa-server /pools/{id}/stocks  → 股票列表（字段: code/name）
 *   3. 腾讯财经 qt.gtimg.cn           → 实时价格（仅交易时段）
 *
 * 注意: /pools/{id}/stocks 不包含分析结果字段（analysis_summary等），
 *       分析数据需后续通过 dsa-server 的 /overview 或分析接口获取。
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

    // Step 1: 获取股池列表
    const poolData = await dsaFetch<{ pools: any[] }>('/pools');
    const pools: any[] = poolData.pools || [];

    // Step 2: 获取每个池的股票列表，收集所有股票代码
    const allCodes: string[] = [];
    const poolStocksMap = new Map<string | number, any[]>();

    for (const pool of pools) {
      try {
        const stockListData = await dsaFetch<{ stocks: any[] }>(`/pools/${pool.id}/stocks`);
        const rawStocks: any[] = stockListData.stocks || [];
        poolStocksMap.set(pool.id, rawStocks);
        for (const s of rawStocks) {
          // /pools/{id}/stocks 返回字段为 code / name（非 stock_code / stock_name）
          if (s.code) allCodes.push(s.code);
        }
      } catch {
        poolStocksMap.set(pool.id, []);
      }
    }

    // Step 3: 交易时段内获取腾讯实时价格
    let priceMap = new Map<string, TencentQuote>();
    if (isMarketOpen() && allCodes.length > 0) {
      priceMap = await fetchTencentPrices([...new Set(allCodes)]);
    }

    // Step 4: 组装最终结果
    const results: StockPool[] = pools.map((pool: any) => {
      const rawStocks = poolStocksMap.get(pool.id) || [];
      const stocks: PoolStock[] = rawStocks.map((s: any) => {
        const price = priceMap.get(s.code);
        return {
          code: s.code,
          name: s.name || '',
          current_price: price?.price ?? null,
          change_pct: price?.changePct ?? null,
          quote_time: price?.time ?? null,
          // 分析字段暂不可用（/pools/{id}/stocks 不返回这些）
          analysis_summary: null,
          action_label: null,
          ideal_buy: null,
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
  } catch (err: any) {
    console.error('[stocks/overview] Failed:', err.message);
    res.status(502).json({ error: '代理上游失败', detail: err.message });
  }
});

export default router;
