import * as vscode from 'vscode';
import { getStockClient } from '../server/endpoints';
import { StockDataProvider, StockOverviewResponse } from './stockTree';

/**
 * 股票行情轮询管理器
 */
export class StockPoller {
  private overviewTimer: ReturnType<typeof setInterval> | null = null;
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private provider: StockDataProvider;
  private cachedCodes: string[] = [];
  private overviewInterval: number;
  private batchInterval = 60000; // 60s

  constructor(provider: StockDataProvider) {
    this.provider = provider;
    this.overviewInterval = 300000; // default 5min
  }

  /** 启动轮询 */
  start(): void {
    // 立即拉取一次
    this.fetchOverview();

    // 拉取配置的刷新间隔
    const cfg = vscode.workspace.getConfiguration('personal-vscode-helper');
    this.overviewInterval = (cfg.get<number>('stockRefreshInterval', 300)) * 1000;

    this.overviewTimer = setInterval(() => this.fetchOverview(), this.overviewInterval);
    this.batchTimer = setInterval(() => this.fetchBatchQuotes(), this.batchInterval);

    // 监听配置变化
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('personal-vscode-helper.stockRefreshInterval')) {
        const cfg = vscode.workspace.getConfiguration('personal-vscode-helper');
        this.overviewInterval = cfg.get<number>('stockRefreshInterval', 300) * 1000;
        if (this.overviewTimer) {
          clearInterval(this.overviewTimer);
          this.overviewTimer = setInterval(() => this.fetchOverview(), this.overviewInterval);
        }
      }
    });
  }

  /** 停止轮询 */
  stop(): void {
    if (this.overviewTimer) {
      clearInterval(this.overviewTimer);
      this.overviewTimer = null;
    }
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /** 手动触发刷新概览 */
  refresh(): void {
    this.fetchOverview();
  }

  /* ─── private ─── */

  private async fetchOverview(): Promise<void> {
    try {
      const client = getStockClient();
      const data = await client.get<StockOverviewResponse>('/api/v1/pools/overview');
      // Cache codes for batch refresh
      this.cachedCodes = data.flatMap(p => p.stocks.map(s => s.code));
      this.provider.updateData(data);
    } catch (err: any) {
      this.provider.setError(err.message || '获取股池数据失败');
    }
  }

  private async fetchBatchQuotes(): Promise<void> {
    if (this.cachedCodes.length === 0) return;
    try {
      const client = getStockClient();
      const codes = this.cachedCodes.join(',');
      const quotes = await client.get<any[]>(`/api/v1/stocks/batch?codes=${codes}`);
      if (!quotes || quotes.length === 0) return;

      // We can't directly modify provider data; just trigger a full refresh
      // For price-only updates, we merge into what we have
      this.fetchOverview(); // Fallback: full refresh
    } catch {
      // Batch refresh failed silently — overview will catch up
    }
  }
}


