import { ApiError, AuthError, NetworkError } from './errors';

const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

/**
 * 统一的 HTTP Client，封装 GET/POST/PUT/PATCH/DELETE
 * 支持认证头、重试（仅 GET）、健康检查
 */
export class ApiClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  /** 切换 baseUrl */
  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  /** 切换 token */
  setToken(token: string): void {
    this.token = token;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path, undefined, true);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete(path: string): Promise<void> {
    await this.request('DELETE', path);
  }

  /** 健康检查 */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.fetch('/api/health', { method: 'GET' }, 5000);
      return res.ok;
    } catch {
      return false;
    }
  }

  /* ─── private ─── */

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retryable = false,
  ): Promise<T> {
    const url = this.buildUrl(path);

    for (let attempt = 0; attempt <= (retryable ? MAX_RETRIES : 0); attempt++) {
      try {
        const res = await this.fetch(url, { method, body });

        if (!res.ok) {
          await this.handleError(res);
        }

        // 204 No Content
        if (res.status === 204) {
          return undefined as unknown as T;
        }

        return (await res.json()) as T;
      } catch (err) {
        if (retryable && attempt < MAX_RETRIES && err instanceof NetworkError) {
          await this.delay(RETRY_DELAY);
          continue;
        }
        throw err;
      }
    }

    throw new Error('unreachable');
  }

  private async fetch(
    url: string,
    init: { method: string; body?: unknown },
    timeout = 10000,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        method: init.method,
        headers,
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
      return res;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new NetworkError(`请求超时 (${timeout}ms)`, err);
      }
      throw new NetworkError(`网络错误: ${err.message}`, err);
    } finally {
      clearTimeout(timer);
    }
  }

  private async handleError(res: Response): Promise<never> {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => undefined);
    }

    const message = typeof body === 'object' && body !== null
      ? (body as any).error || (body as any).detail || `HTTP ${res.status}`
      : `HTTP ${res.status}`;

    if (res.status === 401) {
      throw new AuthError(message, body);
    }

    throw new ApiError(message, res.status, body);
  }

  private buildUrl(path: string): string {
    const base = this.baseUrl.replace(/\/+$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
