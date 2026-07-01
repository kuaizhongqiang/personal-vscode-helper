import { getHelperClient } from '../server/endpoints';
import { StockDataProvider, StockOverviewResponse } from './stockTree';

/**
 * 股票行情管理器（纯手动触发）
 *
 * 通过 helper-server 的 /api/stocks/overview 获取股池+行情+分析数据。
 * 不再自动轮询，改为由刷新命令手动触发。
 */
export class StockPoller {
  private provider: StockDataProvider;

  constructor(provider: StockDataProvider) {
    this.provider = provider;
  }

  /** 启动时首次拉取 */
  start(): void {
    this.fetchOverview();
  }

  /** 停止（保留空方法避免调用方报错） */
  stop(): void {
    // no-op
  }

  /** 手动触发刷新 */
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
