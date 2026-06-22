import * as vscode from 'vscode';

/* ─── Data Models ─── */

export interface PoolStock {
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

export interface StockPool {
  name: string;
  description: string;
  updated_at: string;
  stocks: PoolStock[];
}

export interface StockOverviewResponse extends Array<StockPool> {}

/* ─── Tree Item Types ─── */

const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 分钟

export class PoolTreeItem extends vscode.TreeItem {
  constructor(
    public readonly pool: StockPool,
  ) {
    super(pool.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${pool.stocks.length} 只`;
    this.tooltip = pool.description || pool.name;
    this.contextValue = 'stockPool';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

export class StockTreeItem extends vscode.TreeItem {
  constructor(
    public readonly stock: PoolStock,
  ) {
    const label = `${stock.code}  ${stock.name}`;
    super(label, vscode.TreeItemCollapsibleState.None);

    // Price + change
    const price = stock.current_price !== null && stock.current_price !== undefined
      ? stock.current_price.toFixed(2)
      : '—';
    const change = stock.change_pct !== null && stock.change_pct !== undefined
      ? (stock.change_pct >= 0 ? '+' : '') + stock.change_pct.toFixed(2) + '%'
      : '—';
    this.description = `${price}  ${change}`;

    // Action label (if any)
    if (stock.action_label) {
      this.tooltip = `${stock.name} — ${stock.action_label}`;
    }

    // Staleness warning
    if (stock.quote_time && isStale(stock.quote_time)) {
      this.tooltip = (this.tooltip ? this.tooltip + ' | ' : '') + '⚠ 数据延迟';
    }

    // Strategy line in tooltip
    const buy = stock.ideal_buy !== null ? stock.ideal_buy.toFixed(2) : '—';
    const stop = stock.stop_loss !== null ? stock.stop_loss.toFixed(2) : '—';
    const profit = stock.take_profit !== null ? stock.take_profit.toFixed(2) : '—';
    this.tooltip = (this.tooltip ? this.tooltip + '\n' : '') +
      `买入:${buy}  止损:${stop}  止盈:${profit}`;

    this.contextValue = 'stock';
    this.command = {
      command: 'personal-vscode-helper.openStockDetail',
      title: '查看详情',
      arguments: [stock],
    };
  }
}

function isStale(quoteTime: string): boolean {
  const t = new Date(quoteTime).getTime();
  return Date.now() - t > STALE_THRESHOLD_MS;
}

/* ─── TreeDataProvider ─── */

export class StockDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _pools: StockPool[] = [];
  private _error: string | null = null;

  /** Set new data and refresh tree */
  updateData(pools: StockPool[]): void {
    this._pools = pools;
    this._error = null;
    this._onDidChangeTreeData.fire(undefined);
  }

  /** Set error state */
  setError(error: string): void {
    this._pools = [];
    this._error = error;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) {
      // Return stocks for a pool
      if (element instanceof PoolTreeItem) {
        return element.pool.stocks.map(s => new StockTreeItem(s));
      }
      return [];
    }

    // Root level
    if (this._error) {
      return [new vscode.TreeItem(`⚠ ${this._error}`, vscode.TreeItemCollapsibleState.None)];
    }

    if (this._pools.length === 0) {
      return [new vscode.TreeItem('暂无数据', vscode.TreeItemCollapsibleState.None)];
    }

    return this._pools.map(p => new PoolTreeItem(p));
  }
}
