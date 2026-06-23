import { Router, Request, Response } from 'express';

const router = Router();

/* ─── Config ─── */

// DSA_API_URL 优先（包含 /api/v1 前缀），兼容旧的 DSA_SERVER_URL
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
const CACHE_TTL_MS = 60_000; // 60s

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/* ─── Helpers ─── */

async function dsaFetch(path: string): Promise<any> {
  const url = `${DSA_API_URL}${path.startsWith('/') ? path : '/' + path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`dsa-server error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/* ─── Routes ─── */

/**
 * GET /overview — 透传 dsa-server 的股池总览（含行情+分析+策略价位）
 *
 * 内部调用: GET {DSA_API_URL}/pools/overview
 * 60s 内存缓存，减少穿透
 */
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const cached = getCached('overview');
    if (cached) {
      res.json(cached);
      return;
    }

    const data = await dsaFetch('/pools/overview');
    setCache('overview', data);
    res.json(data);
  } catch (err: any) {
    console.error('[stocks/overview] Failed:', err.message);
    res.status(502).json({ error: '代理上游失败', detail: err.message });
  }
});

/**
 * GET /batch?codes=600519,300750,... — 透传 dsa-server 的批量行情接口
 *
 * 内部调用: GET {DSA_API_URL}/stocks/batch?codes=...
 */
router.get('/batch', async (req: Request, res: Response) => {
  try {
    const codes = req.query.codes as string;
    if (!codes) {
      res.status(400).json({ error: '缺少查询参数 codes' });
      return;
    }
    const data = await dsaFetch(`/stocks/batch?codes=${encodeURIComponent(codes)}`);
    res.json(data);
  } catch (err: any) {
    console.error('[stocks/batch] Failed:', err.message);
    res.status(502).json({ error: '代理上游失败', detail: err.message });
  }
});

export default router;
