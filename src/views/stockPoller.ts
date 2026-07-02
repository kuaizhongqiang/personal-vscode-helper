import { getHelperClient, getConfig } from '../server/endpoints';
import { StockDataProvider, StockOverviewResponse } from './stockTree';

/**
 * 股票行情管理器（自动轮询 + 手动触发）
 *
 * 通过 helper-server 的 /api/stocks/overview 获取股池+行情+分析数据。
 * 启动时立即拉取一次，之后按 stockRefreshInterval 配置自动轮询。
 * 也支持刷新命令手动触发。
 */
export class StockPoller {
  private provider: StockDataProvider;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryCount = 0;
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_BASE_MS = 10_000; // 10s, doubles each retry

  constructor(provider: StockDataProvider) {
    this.provider = provider;
  }

  /** 启动时首次拉取 + 开启自动轮询 */
  start(): void {
    this.fetchOverview();
    this.schedulePolling();
  }

  /** 停止轮询（插件销毁时调用） */
  stop(): void {
    this.clearTimers();
  }

  /** 手动触发刷新（由 vcs-manager.stock.refresh 命令调用） */
  refresh(): void {
    this._retryCount = 0; // 重置重试计数器
    this.fetchOverview();
  }

  /* ─── private ─── */

  private schedulePolling(): void {
    this.clearTimers();
    const interval = getConfig().stockRefreshInterval || 60;
    this._timer = setInterval(() => {
      this._retryCount = 0;
      this.fetchOverview();
    }, interval * 1000);
  }

  private clearTimers(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

  /**
   * 配置变更后重新调度轮询间隔
   * 由 refreshClients 或配置监听器调用
   */
  reschedule(): void {
    if (this._timer) {
      this.schedulePolling();
    }
  }

  private async fetchOverview(): Promise<void> {
    try {
      const client = getHelperClient();
      const data = await client.get<StockOverviewResponse>('/api/stocks/overview');
      this.provider.updateData(data);
      this._retryCount = 0; // 成功后重置重试计数
    } catch (err: any) {
      this.provider.setError(err.message || '获取股池数据失败');
      this.scheduleRetry();
    }
  }

  /**
   * 启动重试：指数退避，最多 MAX_RETRIES 次
   * 避免启动时服务尚未就绪导致永久空数据
   */
  private scheduleRetry(): void {
    if (this._retryCount >= this.MAX_RETRIES) return;
    this._retryCount++;
    const delay = this.RETRY_BASE_MS * Math.pow(2, this._retryCount - 1);
    this._retryTimer = setTimeout(() => {
      this.fetchOverview();
    }, delay);
  }
}
