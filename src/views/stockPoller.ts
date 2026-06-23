import * as vscode from 'vscode';
import { getHelperClient } from '../server/endpoints';
import { StockDataProvider, StockOverviewResponse } from './stockTree';

/**
 * 股票行情轮询管理器
 *
 * 通过 helper-server 的 /api/stocks/overview 获取股池+行情+分析数据，
 * 默认每 60 秒刷新一次（交易时段内由服务端决定是否拉取实时价格）。
 */
export class StockPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private provider: StockDataProvider;
  private interval: number;

  constructor(provider: StockDataProvider) {
    this.provider = provider;
    this.interval = 60000; // default 60s
  }

  /** 启动轮询 */
  start(): void {
    // 立即拉取一次
    this.fetchOverview();

    // 读取配置的刷新间隔
    const cfg = vscode.workspace.getConfiguration('personal-vscode-helper');
    this.interval = (cfg.get<number>('stockRefreshInterval', 60)) * 1000;

    this.timer = setInterval(() => this.fetchOverview(), this.interval);

    // 监听配置变化
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('personal-vscode-helper.stockRefreshInterval')) {
        const cfg = vscode.workspace.getConfiguration('personal-vscode-helper');
        this.interval = cfg.get<number>('stockRefreshInterval', 60) * 1000;
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = setInterval(() => this.fetchOverview(), this.interval);
        }
      }
    });
  }

  /** 停止轮询 */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 手动触发刷新概览 */
  refresh(): void {
    this.fetchOverview();
  }

  /* ─── private ─── */

  private async fetchOverview(): Promise<void> {
    try {
      const client = getHelperClient();
      const data = await client.get<StockOverviewResponse>('/api/stocks/overview');
      this.provider.updateData(data);
    } catch (err: any) {
      this.provider.setError(err.message || '获取股池数据失败');
    }
  }
}
